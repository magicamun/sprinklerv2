import { handleSprinklerFeedbackEvent } from "./sprinklerv2-events.js";

export class SprinklerBaseCard extends HTMLElement {

    constructor() {
        super();
        this._hass = null;
        this._config = null;
        this._lastHash = null;
        this._pendingRequests = new Map();
        // request_id -> { timeout }
    }

    set hass(hass) {
        this._hass = hass;

        if (!this._feedbackRegistered && hass) {
            this._feedbackRegistered = true;

            hass.connection.subscribeEvents(
                (event) => this._handleFeedback(event),
                "sprinkler_ui_feedback"
            ).then(unsub => {
                this._unsubscribe = unsub;
            });
        }

        const data = this.getData?.();

        // 🔥 runtime ignorieren für Vergleich
        const hash = JSON.stringify(this._stripRuntime(data));

        // 👉 FALL 1: nichts strukturell geändert
        if (hash === this._lastHash) {

            // 🔥 nur Runtime updaten (kein Re-Render!)
            this._updateRuntime?.(data);
            return;
        }

        // 👉 FALL 2: echter Datenwechsel
        this._lastHash = hash;

        this._renderInternal(data);
    }

    setConfig(config) {
        this._config = config;
    }

    disconnectedCallback() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
            this._feedbackRegistered = false;
        }
    }

    _handleRequestSuccess(data) {
        // default noop
    }
    
    _handleFeedback(event) {

        // 🔥 1. Snackbar über dein bestehendes Modul
        handleSprinklerFeedbackEvent(event);

        const data = event.data;
        if (!data) return;

        if (!data?.request_id) return;

        const entry = this._pendingRequests?.get(data.request_id);
        if (!entry) return;

        clearTimeout(entry.timeout);
        this._pendingRequests.delete(data.request_id);

        this._handleRequestSuccess?.(data);
    }

    // ----------------------------
    // INTERNAL RENDER
    // ----------------------------
    _renderInternal(data) {
        this._data = data;

        this.innerHTML = `
            <ha-card>
                ${this.baseStyles()}
                ${this.styles?.() || ""}
                ${this.render(data)}
            </ha-card>
        `;

        this._afterRender();
    }

    _afterRender() {
        if (this._view === "edit") {
            this._attachEditEvents?.();
        } else {
            this.attachEvents?.();
        }
    }

    _stripRuntime(data) {

        if (!Array.isArray(data)) return data;

        return data.map(item => {

            return {
                entity_id: item.entity_id,
                state: item.state,

                // 🔥 nur stabile Attribute!
                enabled: item.attributes?.enabled,
                zone_id: item.attributes?.zone_id,
                zone_name: item.attributes?.zone_name,
                deleted: item.attributes?.deleted,

                // optional falls relevant
                soil: item.attributes?.soil_mm,
                deficit: item.attributes?.deficit_mm
            };
        });
    }
    // ----------------------------
    // BASE STYLES (shared!)
    // ----------------------------
    baseStyles() {
        return `
        <style>

            :host {
                display: block;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                box-sizing: border-box;
            }

            * {
                box-sizing: border-box;
                min-width: 0;
            }

            ha-card {
                width: 100%;
                max-width: 100%;
                min-width: 0;

                background: #f6f7f8;
                padding: 10px;
            }

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 14px 14px 14px;
            }

            .title {
                font-size: 18px;
                font-weight: 600;
            }

            .row {
                display: flex;
                align-items: center;
                gap: 12px;

                padding: 8px 14px;
                margin-bottom: 8px;

                border-radius: 12px;
                background: #ffffff;
                border: 1px solid #e6e6e6;

                min-width: 0;
            }

            .row:last-child {
                margin-bottom: 0;
            }

            .center {
                flex: 1;
                text-align: center;
                min-width: 0;
            }

            .name {
                font-size: 15px;
                font-weight: 600;

                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .sub {
                font-size: 13px;
                opacity: 0.7;
                margin-top: 2px;
            }

            .icon-btn {
                width: 40px;
                height: 40px;

                display: flex;
                align-items: center;
                justify-content: center;

                border-radius: 10px;
                cursor: pointer;
            }

            .icon-btn:hover {
                background: rgba(0,0,0,0.05);
            }

            .icon-btn ha-icon {
                --mdc-icon-size: 28px;
            }

            .add-btn ha-icon {
                --mdc-icon-size: 28px;
                color: var(--primary-color);
            }

            .add-btn:hover {
                background: rgba(0,0,0,0.05);
                border-radius: 50%;
            }

            .show-disabled {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                opacity: 0.8;
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 16px;
            }

            .add-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                cursor: pointer;
            }

            /* ---- EDIT VIEW ---- */

            .detail-content {
                padding: 10px 14px;
            }

            .detail-block {
                background: white;
                border-radius: 14px;
                border: 1px solid #e6e6e6;
                padding: 14px 16px;
                margin-bottom: 18px;
            }

            .divider {
                height: 1px;
                background: var(--divider-color);
                margin: 14px 0;
                opacity: 0.35;
            }

            .detail-row {
                display: grid;
                grid-template-columns: auto 1fr;
                align-items: center;
                gap: 10px;
                padding: 8px 0;
            }

            .label {
                font-size: 13px;
                opacity: 0.6;
            }

            .slider-row {
                display: grid;
                grid-template-columns: 110px 1fr auto;
                align-items: center;
                gap: 10px;
                padding: 8px 6px 8px 0;
            }

            .slider-value {
                text-align: right;
                font-size: 13px;
                font-weight: 500;
                white-space: nowrap;
            }

            .toggle-row {
                grid-template-columns: 1fr auto;
            }

            .stepper-row {
                grid-template-columns: 110px 1fr;
            }

            .stepper {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 12px;
            }

            .step-btn {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: 1px solid var(--divider-color);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 18px;
            }

            .step-value {
                min-width: 30px;
                text-align: center;
                font-weight: 500;
            }

            /* ---- INLINE TITLE ---- */

            .title-inline-wrapper {
                flex: 1;
                text-align: center;
            }

            .title-inline-display {
                font-size: 18px;
                font-weight: 600;
                cursor: pointer;
            }

            .title-inline-input {
                font-size: 18px;
                font-weight: 600;
                border: none;
                outline: none;
                text-align: center;
                width: 100%;
                background: transparent;
            }
        </style>
        `;
    }

    // ----------------------------
    // ABSTRACTS
    // ----------------------------
    getData() {
        return {};
    }

    render(_data) {
        return "";
    }

}