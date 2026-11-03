import {
  AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AttributionControl, Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent,
} from 'maplibre-gl';
import { getUserLocation, locationMessage } from '../../../core/location/user-location';
import { AppCurtain } from '../../../core/app-curtain';
import { API_ERROR_KEYS } from '../../../core/error/api-error';
import { Haptic } from '../../../core/haptics';
import { Motion } from '../../../core/motion';
import { ZoneSharer, type ShareOutcome } from '../../../core/share/share-zone';
import { SearchRequest } from '../../../core/search-request';
import type { ZoneBoundaries, ZoneRiskSummary } from '../../../domain/model/risk';
import { averagePerYear } from '../../../domain/util/fire-history';
import { nearbySummary, type NearbySummary } from '../../../domain/util/nearby';
import { formatTime } from '../../../domain/util/format';
import { shareText } from '../../../domain/util/share-text';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { CompareStore } from '../../../state/compare.store';
import { FavoritesStore } from '../../../state/favorites.store';
import { ZonesStore } from '../../../state/zones.store';
import { AppIcon } from '../../components/app-icon/app-icon';
import { MapOverviewSheet } from '../../components/map-overview-sheet/map-overview-sheet';
import { NearbyCard } from '../../components/nearby-card/nearby-card';
import { SearchBox } from '../../components/search-box/search-box';
import { MID_HEIGHT } from '../../components/zone-sheet/sheet-snap';
import { ZoneSheet } from '../../components/zone-sheet/zone-sheet';
import {
  FLY_MS, MAX_BOUNDS, MAX_ZOOM, MIN_ZOOM_OVER_NARINO, NARINO_BOUNDS, NO_PADDING, PITCH, SPIN_MS, TAP_FLY_MS,
  ZONE_FLY_MS, ZONE_ZOOM,
  globeHalo, globeStart, hasWebGL, introPlan, narinoPadding, readIntroPlayed, rememberIntroPlayed, spinCenter,
} from './map-camera';
import {
  BOUNDARIES_SOURCE, DEPARTMENT_SOURCE, HIGHLIGHT_SOURCE, HOTSPOTS_SOURCE, ZONE_FILL_LAYER, ZONE_SELECTED_LAYERS, boundariesSource,
  boundaryLayers, departmentSource, highlightLayers, highlightPoint, hotspotLayers, hotspotPoints, hotspotsSource, readMapColors,
  selectedZoneFilter, zoneStates, type MapColors,
} from './map-layers';
import { mapStyle } from './map-style';
import {
  coveredDots, labelPriority, showsNames, visibleLabels, zoneMarkerHtml, type LabelBox, type ScreenBox,
} from './zone-marker';

/** MapLibre's worker, copied next to the app by angular.json (it cannot come from a CDN). */
const WORKER_PATH = 'maplibre/maplibre-gl-worker.mjs';
/**
 * The globe spins and flies once per session (sessionStorage, so a reload does not replay it);
 * later visits open straight over Nariño. This flag covers a browser without storage.
 */
let introPlayed = false;
/** Any of these on the map during the intro skips it. */
const SKIP_EVENTS = ['mousedown', 'touchstart', 'wheel'] as const;
/** How far (px) the globe's orange halo reaches beyond its edge. */
const GLOW_WIDTH = 44;
/** Room (px) a label keeps from the edges of the free map area. */
const LABEL_MARGIN = 4;
/** Half the size (px) of the dot of a municipality whose label does not fit (map-markers.css). */
const DOT_RADIUS = 4;
/** How long (ms) the zone sheet shows «Copiado» or a failed share. */
const NOTICE_MS = 2000;
/** What the sheet says after sharing; the menu itself is the feedback when it opens. */
const SHARE_NOTICES: Partial<Record<ShareOutcome, MessageKey>> = { copied: 'share.copied', failed: 'share.failed' };
/** A flown-to seat sits this far above the center, clear of the zone sheet. */
const SEAT_OFFSET: [number, number] = [0, -150];

@Component({
  selector: 'app-map-page',
  imports: [AppIcon, MapOverviewSheet, NearbyCard, SearchBox, TranslatePipe, ZoneSheet],
  templateUrl: './map.page.html',
  styleUrl: './map.page.css',
  // --sheet-inset: how much of the map the sheet covers, so the credits sit just above it.
  host: { class: 'ion-page', '[style.--sheet-inset.px]': 'sheetInset()' },
})
export class MapPage implements AfterViewInit, OnDestroy {
  protected readonly store = inject(ZonesStore);
  protected readonly favorites = inject(FavoritesStore);
  protected readonly compare = inject(CompareStore);
  private readonly router = inject(Router);
  private readonly searchRequest = inject(SearchRequest);
  private readonly curtain = inject(AppCurtain);
  private readonly sharer = inject(ZoneSharer);
  private readonly i18n = inject(I18n);
  private readonly haptic = inject(Haptic);
  private readonly motion = inject(Motion);

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private readonly overview = viewChild('overview', { read: ElementRef<HTMLElement> });
  private readonly glow = viewChild.required<ElementRef<HTMLDivElement>>('glow');
  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');
  private map?: MapLibreMap;
  /** The map credits: rebuilt when the boundaries arrive and when the language changes. */
  private credits?: AttributionControl;
  private colors?: MapColors;
  /** One marker per municipality, by zone id: never grouped. */
  private readonly markers = new Map<string, Marker>();
  private userMarker?: Marker;
  private spinFrame?: number;
  private spinning = false;
  /** Ends the intro (spin or flight to Nariño) and drops its skip listeners; false outside it. */
  private endIntro: () => boolean = () => false;
  /** Bumped by every camera move the page starts, so a flight that was cut short does not finish its work. */
  private cameraMove = 0;
  private destroyed = false;
  private readonly mapReady = signal(false);
  private boundariesShown = false;
  /** The camera shows the whole department (intro, «Acercar a Nariño»), untouched since. */
  private framingNarino = false;
  protected readonly sheetInset = signal(0);
  /** No WebGL: MapLibre cannot draw in any projection, so the map area explains it instead. */
  protected readonly mapUnavailable = signal(false);
  /** The glass search layer, opened from the magnifier of the bottom nav. */
  protected readonly searchOpen = signal(false);
  protected readonly locating = signal(false);
  /** Why «Mi ubicación» failed, as a text key (kept apart from the store error, whose retry reloads zones). */
  protected readonly locationError = signal<MessageKey | null>(null);
  /** «Cerca de mí», after «Mi ubicación»: it takes the place of the overview sheet until closed. */
  protected readonly nearby = signal<NearbySummary | null>(null);
  protected readonly errorKeys = API_ERROR_KEYS;
  protected readonly shareNotice = signal<string | null>(null);
  private noticeTimer?: ReturnType<typeof setTimeout>;

  protected readonly updatedLabel = computed(() => {
    const date = this.store.updatedAt();
    return date ? this.i18n.t('map.updated', { time: formatTime(date, this.i18n.language()) }) : this.i18n.t('map.loading');
  });

  /** Fires per year of the selected zone, from its records (null until they arrive). */
  protected readonly firesPerYear = computed(() => {
    const history = this.store.detailFires();
    return history ? averagePerYear(history.events, new Date()) : null;
  });

  constructor() {
    // The bottom nav's magnifier (on any screen) navigates here and asks for the search.
    effect(() => {
      if (!this.searchRequest.pending()) return;
      this.searchRequest.consume();
      this.searchOpen.set(true);
    });
    effect(() => {
      if (!this.mapReady()) return;
      this.setZones(this.store.zones());
    });
    effect(() => {
      if (!this.mapReady()) return;
      this.source(HOTSPOTS_SOURCE)?.setData(hotspotPoints(this.store.hotspots()));
    });
    // Opening a zone (from the card, the search or the map) ends «Cerca de mí».
    effect(() => {
      if (this.store.selectedId()) untracked(() => this.closeNearby());
    });
    effect(() => {
      if (!this.mapReady()) return;
      const boundaries = this.store.boundaries();
      if (boundaries && !this.boundariesShown) this.showBoundaries(boundaries);
    });
    effect(() => {
      if (!this.mapReady()) return;
      this.styleSelection(this.store.zones(), this.store.selectedId(), this.store.boundaries());
    });
    // Markers and credits live outside Angular: a new language redraws them (and their labels take new room).
    effect(() => {
      this.i18n.language();
      if (!this.mapReady()) return;
      untracked(() => {
        for (const [zoneId, marker] of this.markers) this.paintZoneMarker(marker, zoneId);
        this.placeLabels();
        if (this.map) this.showCredits(this.map);
      });
    });
    // A sheet that grows covers more map: the labels under it give way (and the ones it uncovers come back).
    effect(() => {
      this.sheetInset();
      if (this.mapReady()) untracked(() => this.placeLabels());
    });
    // The overview sheet folds and unfolds: the credits follow it and Nariño is framed again above it.
    effect((onCleanup) => {
      const overview = this.overview()?.nativeElement;
      if (!overview) {
        // The zone sheet opens at MID_HEIGHT of the screen.
        const zoneOpen = this.store.selected() !== null;
        this.sheetInset.set(zoneOpen ? Math.round(this.mapElement().nativeElement.clientHeight * MID_HEIGHT) : 0);
        return;
      }
      const observer = new ResizeObserver(() => {
        this.sheetInset.set(overview.offsetHeight);
        if (this.framingNarino) this.reframeNarino();
      });
      observer.observe(overview);
      onCleanup(() => observer.disconnect());
    });
  }

  ngAfterViewInit(): void {
    if (this.store.zones().length === 0) this.store.load();
    this.store.loadBoundaries();
    if (!hasWebGL(document)) {
      this.mapUnavailable.set(true);
      return;
    }
    this.createMap();
  }

  private createMap(): void {
    setWorkerUrl(new URL(WORKER_PATH, document.baseURI).href);
    const element = this.mapElement().nativeElement;
    const colors = readMapColors(element);
    this.colors = colors;
    const plan = introPlan({
      hasSelection: this.store.selectedId() !== null,
      reducedMotion: this.motion.reduced(),
      firstVisit: !introPlayed && !readIntroPlayed(window),
    });
    introPlayed = true;
    rememberIntroPlayed(window);

    const map = new MapLibreMap({
      container: element,
      style: mapStyle(),
      ...globeStart({ width: element.clientWidth, height: element.clientHeight, bottom: this.sheetHeight() }),
      maxZoom: MAX_ZOOM,
      maxPitch: PITCH,
      attributionControl: false,
      // The view keeps north up: tilt comes from the camera, not from the fingers.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    this.map = map;
    map.touchZoomRotate.disableRotation();
    this.showCredits(map);

    const updateZoomClass = (): void => {
      // The globe (intro): only the colored polygons, no marker piled on Nariño.
      element.classList.toggle('is-far', map.getZoom() < MIN_ZOOM_OVER_NARINO);
      const names = showsNames(map.getZoom());
      if (names === element.classList.contains('show-names')) return;
      // Crossing into the names: they wait hidden until the camera stops and placeLabels sorts them out.
      if (names) this.hideLabels();
      element.classList.toggle('show-names', names);
    };
    map.on('zoom', updateZoomClass);
    updateZoomClass();
    map.on('moveend', () => this.placeLabels());
    map.on('move', () => this.placeGlow());
    map.on('resize', () => this.placeGlow());
    this.placeGlow();
    map.on('click', ZONE_FILL_LAYER, (event) => this.onPolygonTap(event));
    // A finger (or the wheel) moving the map ends the department framing; camera flights do not.
    map.on('movestart', (event) => {
      if (event.originalEvent) this.framingNarino = false;
    });
    map.once('load', () => {
      this.addLayers(map, colors);
      this.mapReady.set(true);
      this.openCamera(plan);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.noticeTimer);
    this.endIntro();
    this.stopSpin();
    this.map?.remove();
  }

  protected selectZone(zone: ZoneRiskSummary, duration = ZONE_FLY_MS): void {
    this.store.select(zone.id);
    this.flyToSeat(zone.longitude, zone.latitude, duration);
  }

  protected pickFromSearch(zone: ZoneRiskSummary): void {
    this.searchOpen.set(false);
    this.selectZone(zone);
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
  }

  /** «Acercar a Nariño»: back to the whole department (a jump with reduced motion). */
  protected zoomToNarino(): void {
    this.flyToNarino(false);
  }

  /**
   * The zone sheet closed (its back button, the backdrop or a drag down): the camera stays where it is
   * and the municipality loses its highlight. Only «Acercar a Nariño» goes back to the whole department.
   */
  protected closeSheet(): void {
    this.store.clearSelection();
  }

  /** The sheet's heart: adds or removes the zone from «Mis municipios», with a light tap on the phone. */
  protected toggleFavorite(zoneId: string): void {
    void this.favorites.toggle(zoneId);
    this.haptic.tap();
  }

  /**
   * «Compartir»: the zone's risk as the sheet shows it now (the detail once it arrived), its 72 h
   * forecast when the model answered, and when the data was loaded (the map's «Actualizado»).
   */
  protected async shareZone(zone: ZoneRiskSummary): Promise<void> {
    const risk = this.store.detail() ?? zone;
    const forecast = this.store.forecastStatus() === 'ready' ? this.store.detailForecast() : null;
    const outcome = await this.sharer.share({
      title: this.i18n.t('share.title', { name: risk.name }),
      text: shareText(risk, forecast, this.store.updatedAt(), this.i18n.language()),
    });
    const notice = SHARE_NOTICES[outcome];
    if (!notice || this.destroyed) return;
    clearTimeout(this.noticeTimer);
    this.shareNotice.set(this.i18n.t(notice));
    this.noticeTimer = setTimeout(() => this.shareNotice.set(null), NOTICE_MS);
  }

  /** Adds the zone to «Comparar» (if there is room; if not, «Comparar» offers it) and opens it. */
  protected compareZone(zoneId: string): void {
    this.compare.add(zoneId);
    void this.router.navigateByUrl('/compare');
  }

  protected openHistory(zoneId: string): void {
    void this.router.navigate(['/history'], { queryParams: { zoneId } });
  }

  protected async locateMe(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    this.locationError.set(null);
    const result = await getUserLocation();
    this.locating.set(false);
    if (result.status !== 'ok') {
      this.locationError.set(locationMessage(result.status));
      return;
    }
    const { latitude, longitude } = result;
    this.showUser(latitude, longitude);
    // The card says where the person is; the zone sheet opens from it (it no longer opens by itself).
    this.nearby.set(nearbySummary(latitude, longitude, this.store.zones(), this.store.hotspots(), this.store.boundaries()));
    this.flyToSeat(longitude, latitude);
  }

  protected openNearbyZone(zoneId: string): void {
    const zone = this.store.zones().find((z) => z.id === zoneId);
    if (zone) this.selectZone(zone);
  }

  /** Flies to the closest heat spot and rings it; the card stays open. */
  protected showNearbyHotspot(): void {
    const nearest = this.nearby()?.hotspot?.hotspot;
    if (!nearest) return;
    this.source(HIGHLIGHT_SOURCE)?.setData(highlightPoint(nearest));
    this.flyToSeat(nearest.longitude, nearest.latitude);
  }

  protected closeNearby(): void {
    if (!this.nearby()) return;
    this.nearby.set(null);
    this.source(HIGHLIGHT_SOURCE)?.setData(highlightPoint(null));
  }

  /** The base style is ready: add the hotspots and (when they arrive) the municipal polygons. */
  private addLayers(map: MapLibreMap, colors: MapColors): void {
    map.addSource(HOTSPOTS_SOURCE, hotspotsSource([]));
    for (const layer of hotspotLayers(colors)) map.addLayer(layer);
    map.addSource(HIGHLIGHT_SOURCE, { type: 'geojson', data: highlightPoint(null) });
    for (const layer of highlightLayers()) map.addLayer(layer);
  }

  /** Polygons go under the hotspots and the markers. Added once: risk and selection only restyle them. */
  private showBoundaries(boundaries: ZoneBoundaries): void {
    const map = this.map;
    if (!map || !this.colors) return;
    this.boundariesShown = true;
    map.addSource(BOUNDARIES_SOURCE, boundariesSource(boundaries));
    map.addSource(DEPARTMENT_SOURCE, departmentSource(boundaries));
    for (const layer of boundaryLayers(this.colors)) map.addLayer(layer, 'hotspot-halo');
    this.showCredits(map);
    this.styleSelection(this.store.zones(), this.store.selectedId(), boundaries);
  }

  /**
   * Always expanded: OpenStreetMap and DANE ask to be credited where the map is seen. OSM's credit
   * comes with its tiles; DANE's, in the app's language, once the boundaries are on the map.
   */
  private showCredits(map: MapLibreMap): void {
    if (this.credits) map.removeControl(this.credits);
    const boundaries = this.boundariesShown ? this.i18n.t('map.boundariesCredit') : undefined;
    this.credits = new AttributionControl({ compact: false, customAttribution: boundaries });
    map.addControl(this.credits, 'bottom-right');
  }

  /** One marker per municipality on its seat; new scores rebuild them. */
  private setZones(zones: readonly ZoneRiskSummary[]): void {
    const map = this.map;
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    if (!map) return;
    for (const zone of zones) this.markers.set(zone.id, this.zoneMarker(zone).setLngLat([zone.longitude, zone.latitude]).addTo(map));
    if (!map.isMoving()) this.placeLabels();
  }

  private styleSelection(zones: readonly ZoneRiskSummary[], selectedId: string | null, boundaries: ZoneBoundaries | null): void {
    const map = this.map;
    if (!map) return;
    if (boundaries && this.boundariesShown) {
      for (const { id, state } of zoneStates(boundaries, zones, selectedId)) map.setFeatureState({ source: BOUNDARIES_SOURCE, id }, state);
      for (const layer of ZONE_SELECTED_LAYERS) map.setFilter(layer, selectedZoneFilter(selectedId));
    }
    // Markers already on screen take the new score, level or selection; the selected name goes first.
    for (const [zoneId, marker] of this.markers) this.paintZoneMarker(marker, zoneId);
    this.placeLabels();
  }

  /** Same as tapping the marker. A tap that started on a marker is the marker's, not the polygon's. */
  private onPolygonTap(event: MapLayerMouseEvent): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('.maplibregl-marker')) return;
    const id = event.features?.[0]?.properties['id'];
    const zone = this.store.zones().find((z) => z.id === id);
    // Zones without a score yet have no sheet to open.
    if (zone) this.selectZone(zone, TAP_FLY_MS);
  }

  /**
   * Shows the labels that fit without overlapping: the selected zone, Pasto, then the riskiest. The
   * rest are a small dot, dropped when a shown label covers it, so a municipality is never a label and
   * a dot at once. Measured when the camera stops, so nothing flickers while it moves; on the globe
   * there are no markers to place.
   */
  private placeLabels(): void {
    const map = this.map;
    if (!map || map.getZoom() < MIN_ZOOM_OVER_NARINO) return;
    const scores = new Map(this.store.zones().map((zone) => [zone.id, zone.score]));
    const selectedId = this.store.selectedId();
    const boxes: LabelBox[] = [];
    for (const [zoneId, marker] of this.markers) {
      const label = marker.getElement().querySelector('.zone-label');
      if (!label) continue;
      const { left, top, right, bottom } = label.getBoundingClientRect();
      boxes.push({ key: zoneId, priority: labelPriority(zoneId, scores.get(zoneId) ?? 0, selectedId), left, top, right, bottom });
    }
    const shown = visibleLabels(boxes, this.labelArea());
    const dots: (ScreenBox & { readonly key: string })[] = [];
    for (const [zoneId, marker] of this.markers) {
      const element = marker.getElement();
      element.classList.toggle('label-hidden', !shown.has(zoneId));
      if (!shown.has(zoneId)) {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        const x = (left + right) / 2;
        const y = (top + bottom) / 2;
        dots.push({ key: zoneId, left: x - DOT_RADIUS, top: y - DOT_RADIUS, right: x + DOT_RADIUS, bottom: y + DOT_RADIUS });
      }
    }
    const covered = coveredDots(dots, boxes.filter((box) => shown.has(box.key)));
    for (const [zoneId, marker] of this.markers) marker.getElement().classList.toggle('dot-hidden', covered.has(zoneId));
  }

  /** Where a label can show whole: the map below the header and above the sheet, with a small margin. */
  private labelArea(): ScreenBox {
    const map = this.mapElement().nativeElement.getBoundingClientRect();
    return {
      left: map.left + LABEL_MARGIN,
      right: map.right - LABEL_MARGIN,
      top: this.header().nativeElement.getBoundingClientRect().bottom + LABEL_MARGIN,
      bottom: map.bottom - this.sheetInset() - LABEL_MARGIN,
    };
  }

  private hideLabels(): void {
    for (const marker of this.markers.values()) marker.getElement().classList.add('label-hidden');
  }

  private zoneMarker(zone: ZoneRiskSummary): Marker {
    const zoneId = zone.id;
    const element = document.createElement('div');
    // Its label shows once placeLabels finds room for it.
    element.className = 'zone-icon label-hidden';
    element.title = zone.name;
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = this.store.zones().find((z) => z.id === zoneId);
      if (current) this.selectZone(current, TAP_FLY_MS);
    });
    const marker = new Marker({ element });
    this.paintZoneMarker(marker, zoneId);
    return marker;
  }

  private paintZoneMarker(marker: Marker, zoneId: string): void {
    const zone = this.store.zones().find((z) => z.id === zoneId);
    if (!zone) return;
    const selected = zone.id === this.store.selectedId();
    const element = marker.getElement();
    element.innerHTML = zoneMarkerHtml(zone, selected, this.i18n.language());
    // The selected marker goes on top, so its name is not hidden under its neighbours.
    element.style.zIndex = selected ? '2' : '';
  }

  private openCamera(plan: ReturnType<typeof introPlan>): void {
    if (plan === 'spin-fly') {
      // The globe waits in full view until the splash (or the introduction) is gone.
      void this.curtain.lifted.then(() => {
        if (!this.destroyed) this.spin();
      });
      return;
    }
    this.jumpToNarino();
    const selected = this.store.zones().find((z) => z.id === this.store.selectedId());
    if (plan === 'zone' && selected) this.flyToSeat(selected.longitude, selected.latitude);
  }

  /** The globe turns slowly, then flies to Nariño. Touching the map, spinning or flying, skips to the end. */
  private spin(): void {
    const map = this.map;
    if (!map) return;
    const start = performance.now();
    this.spinning = true;
    const skip = (): void => {
      this.endIntro();
      this.stopSpin();
      map.stop();
      this.jumpToNarino();
    };
    this.endIntro = () => {
      this.endIntro = () => false;
      for (const type of SKIP_EVENTS) map.off(type, skip);
      return true;
    };
    for (const type of SKIP_EVENTS) map.on(type, skip);
    const frame = (now: number): void => {
      if (!this.spinning) return;
      const elapsed = now - start;
      if (elapsed >= SPIN_MS) {
        this.stopSpin();
        this.flyToNarino();
        return;
      }
      map.setCenter(spinCenter(elapsed));
      this.spinFrame = requestAnimationFrame(frame);
    };
    this.spinFrame = requestAnimationFrame(frame);
  }

  /** The faint orange halo at the edge of the globe (MapLibre's own atmosphere is blue and fixed). */
  private placeGlow(): void {
    const map = this.map;
    const glow = this.glow().nativeElement;
    const halo = map
      ? globeHalo({
          zoom: map.getZoom(),
          centerLatitude: map.getCenter().lat,
          width: map.getContainer().clientWidth,
          height: map.getContainer().clientHeight,
          padding: map.getPadding(),
        })
      : null;
    if (!halo) {
      glow.style.opacity = '0';
      return;
    }
    const outer = halo.radius + GLOW_WIDTH;
    glow.style.opacity = String(halo.opacity);
    glow.style.width = glow.style.height = `${outer * 2}px`;
    glow.style.transform = `translate(${halo.x - outer}px, ${halo.y - outer}px)`;
    glow.style.setProperty('--edge', `${(halo.radius / outer) * 100}%`);
  }

  /** Ends the spin; false if it had already ended. */
  private stopSpin(): boolean {
    if (!this.spinning) return false;
    this.spinning = false;
    if (this.spinFrame !== undefined) cancelAnimationFrame(this.spinFrame);
    return true;
  }

  /** Height of the overview sheet, by layout (its entry animation only moves it). */
  private sheetHeight(): number {
    return this.overview()?.nativeElement.offsetHeight ?? 0;
  }

  /** Nariño as large as fits between the header and the sheet, tilted. Same for the intro and the button. */
  private narinoCamera() {
    const camera = this.map?.cameraForBounds(NARINO_BOUNDS, { padding: narinoPadding(this.sheetHeight()), pitch: PITCH });
    return camera && { ...camera, pitch: PITCH, padding: NO_PADDING };
  }

  /** The intro flight is essential (reduced motion never gets here); the button's is not. */
  private flyToNarino(essential = true): void {
    const map = this.map;
    const camera = this.narinoCamera();
    if (!map || !camera) return;
    this.framingNarino = false;
    const move = ++this.cameraMove;
    map.once('moveend', () => {
      // A skip or another flight took over: that one finishes the work.
      if (move !== this.cameraMove) return;
      this.endIntro();
      this.limitToNarino();
      this.framingNarino = true;
    });
    map.flyTo({ ...camera, duration: this.flightMs(FLY_MS), essential });
  }

  /** The sheet changed height while showing the department: frame it again above the sheet. */
  private reframeNarino(): void {
    const camera = this.narinoCamera();
    if (camera) this.map?.easeTo({ ...camera, duration: this.flightMs(350) });
  }

  private jumpToNarino(): void {
    const map = this.map;
    const camera = this.narinoCamera();
    if (!map || !camera) return;
    this.cameraMove++;
    map.jumpTo(camera);
    this.limitToNarino();
    this.framingNarino = true;
  }

  /** «Reducido» in Ajustes: the camera jumps (MapLibre already does it when the phone asks for less motion). */
  private flightMs(duration: number): number {
    return this.motion.reduced() ? 0 : duration;
  }

  /** Once over Nariño the camera stays around it. */
  private limitToNarino(): void {
    this.map?.setMaxBounds(MAX_BOUNDS);
    this.map?.setMinZoom(MIN_ZOOM_OVER_NARINO);
  }

  /**
   * Non-essential: MapLibre jumps instead of flying when the phone asks for reduced motion. A zone
   * picked during the spin wins over the flight to Nariño; the camera is limited once it lands.
   */
  private flyToSeat(longitude: number, latitude: number, duration = ZONE_FLY_MS): void {
    const fromIntro = this.endIntro();
    this.stopSpin();
    this.cameraMove++;
    this.framingNarino = false;
    this.map?.flyTo({
      center: [longitude, latitude], zoom: ZONE_ZOOM, pitch: PITCH, offset: SEAT_OFFSET, padding: NO_PADDING,
      duration: this.flightMs(duration),
    });
    // Cut short, the intro never limited the camera: the seat's flight does it when it lands (registered
    // after flyTo, which ends the intro's own flight with a moveend).
    if (fromIntro) this.map?.once('moveend', () => this.limitToNarino());
  }

  private showUser(latitude: number, longitude: number): void {
    const map = this.map;
    if (!map) return;
    this.userMarker?.remove();
    const element = document.createElement('div');
    element.className = 'user-icon';
    element.innerHTML = '<span class="user-dot"></span>';
    this.userMarker = new Marker({ element }).setLngLat([longitude, latitude]).addTo(map);
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map?.getSource<GeoJSONSource>(id);
  }
}
