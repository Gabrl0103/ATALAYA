import { Component, Injector, inject, input, signal } from '@angular/core';
import { EMERGENCY_LINES, telHref, type EmergencyLine } from '../../../core/emergency/emergency-lines';
import { LOCATE_USER, locationMessage } from '../../../core/location/user-location';
import { ZoneSharer, type ShareOutcome } from '../../../core/share/share-zone';
import { emergencyText, placeOf, type EmergencyReport } from '../../../domain/util/emergency-text';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { ZonesStore } from '../../../state/zones.store';
import { AppIcon } from '../app-icon/app-icon';

/** What to say when calling, in this order. */
const TIPS: readonly MessageKey[] = ['emergency.tip.place', 'emergency.tip.what', 'emergency.tip.homes', 'emergency.tip.contact'];

const SHARE_NOTICES: Partial<Record<ShareOutcome, MessageKey>> = { copied: 'share.copied', failed: 'share.failed' };

let nextId = 0;

/**
 * «¿Ves fuego? Avisa»: call buttons (tel: links), what to say when calling and «Compartir mi ubicación».
 * The location is read only when that button is tapped, and goes out only through the phone's own share
 * menu: nothing is saved nor sent to a server.
 */
@Component({
  selector: 'app-emergency-help',
  imports: [AppIcon, TranslatePipe],
  template: `
    <section class="emergency glass-card anim-up" [style.--i]="startIndex()" [attr.aria-labelledby]="titleId">
      <div class="emergency-head">
        <span class="emergency-icon" aria-hidden="true"><app-icon name="flame" [size]="20" /></span>
        <div role="heading" [attr.aria-level]="headingLevel()" [id]="titleId" class="emergency-title">
          {{ 'emergency.title' | t }}
        </div>
      </div>
      <p class="intro">{{ 'emergency.intro' | t }}</p>

      <ul class="lines">
        @for (line of lines; track line.id; let i = $index) {
          <li class="anim-up" [style.--i]="startIndex() + 1 + i">
            <a class="call" [href]="href(line)" [attr.aria-label]="'emergency.call' | t: { name: (line.name | t), number: line.number }">
              <app-icon name="phone" [size]="18" />
              <span class="call-name">{{ line.name | t }}</span>
              <b class="mono">{{ line.number }}</b>
            </a>
          </li>
        }
      </ul>

      <details class="tips">
        <summary>{{ 'emergency.tipsTitle' | t }}</summary>
        <ul>
          @for (tip of tips; track tip) {
            <li>{{ tip | t }}</li>
          }
        </ul>
      </details>

      <div class="share">
        <button type="button" class="action primary" [attr.aria-busy]="locating()" [disabled]="locating()" (click)="shareLocation()">
          <app-icon name="map-pin" [size]="18" />
          {{ (locating() ? 'emergency.locating' : 'emergency.shareLocation') | t }}
        </button>
        @if (locationError(); as error) {
          <p class="error" role="alert">{{ error | t }}</p>
          @if (zoneName()) {
            <button type="button" class="action" (click)="shareWithoutLocation()">{{ 'emergency.shareWithout' | t }}</button>
          }
        }
        @if (notice(); as message) {
          <p class="notice" role="status">{{ message | t }}</p>
        }
        <p class="note">{{ 'emergency.shareNote' | t }}</p>
      </div>

      <p class="disclaimer">{{ 'emergency.disclaimer' | t }}</p>
    </section>
  `,
  styleUrl: './emergency-help.css',
})
export class EmergencyHelp {
  /** The zone on screen: «Compartir sin ubicación» names it when the location cannot be read. */
  readonly zoneName = input<string | null>(null);
  /** 3 inside the zone sheet (under its h2), 2 as a section of Ajustes. */
  readonly headingLevel = input<2 | 3>(3);
  /** Where its entrance falls in the screen's stagger (--i). */
  readonly startIndex = input(0);

  protected readonly lines: readonly EmergencyLine[] = EMERGENCY_LINES;
  protected readonly tips = TIPS;
  protected readonly titleId = `emergency-title-${++nextId}`;
  protected readonly href = telHref;

  protected readonly locating = signal(false);
  protected readonly locationError = signal<MessageKey | null>(null);
  protected readonly notice = signal<MessageKey | null>(null);

  private readonly locate = inject(LOCATE_USER);
  private readonly sharer = inject(ZoneSharer);
  private readonly i18n = inject(I18n);
  // Read only when sharing: the zones and boundaries the app already has, to name the municipality.
  private readonly injector = inject(Injector);

  /** Asks for the location now (the tap is the user's consent), then opens the share menu with it. */
  protected async shareLocation(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    this.locationError.set(null);
    this.notice.set(null);
    const result = await this.locate();
    this.locating.set(false);
    if (result.status !== 'ok') {
      this.locationError.set(locationMessage(result.status));
      return;
    }
    const position = { latitude: result.latitude, longitude: result.longitude };
    const store = this.injector.get(ZonesStore);
    await this.send({ position, place: placeOf(position, store.zones(), store.boundaries()) });
  }

  /** Without a location: the municipality on screen and that the location is not available. */
  protected async shareWithoutLocation(): Promise<void> {
    const name = this.zoneName();
    this.notice.set(null);
    await this.send({ position: null, place: name ? { name, place: 'viewed' } : null });
  }

  private async send(report: EmergencyReport): Promise<void> {
    const language = this.i18n.language();
    const outcome = await this.sharer.share({
      title: this.i18n.t('emergency.share.title'),
      text: emergencyText(report, language),
    });
    this.notice.set(SHARE_NOTICES[outcome] ?? null);
  }
}
