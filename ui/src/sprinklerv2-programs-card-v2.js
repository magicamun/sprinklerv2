import { SprinklerBaseCard } from "./sprinklerv2-base-card.js";
import { openConfirmDialog } from "./sprinklerv2-utils.js";
import { callServiceWithRequest } from "./sprinklerv2-events.js";
import { isAdmin } from "./sprinklerv2-utils.js";

class SprinklerProgramsCardV2 extends SprinklerBaseCard {

    constructor() {
        super();
        this._view = "list";
        this._selectedProgramId = null;
        this._workingProgram = null;
        this._isNewProgram = false;
        this._validationErrors = {};
        this._activeDialog = null;
    }

    // ----------------------------
    // DATA
    // ----------------------------

    getData() {
        if (!this._hass) return [];

        const entityId = this._config?.entity;
        const sensor = entityId ? this._hass.states[entityId] : null;

        return sensor?.attributes?.programs || [];
    }

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Program entity (entity) is required");
        }

        this._config = {
            ...config,
            zones_prefix:
                config.zones_prefix ??
                config.entity.replace(/_programs?.*$/i, "_zone")
        };
    }

    styles() {
    return `
        <style>

            /* =========================
                CARD BASE
            ========================== */
            .back-btn:hover,
            .save-btn:hover,
            .add-btn:hover {
                background: rgba(0,0,0,0.05);
            }

            /* =========================
                PROGRAM LIST VIEW
            ========================== */
            .programs {
                padding: 0;
            }

            .program-row {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 14px;
                margin-bottom: 8px;
                border-radius: 12px;
                background: #ffffff;
                border: 1px solid #e6e6e6;
            }

            .program-action[data-state="queued"] ha-icon {
                color: #fb8c00;
            }

            .program-row:last-child {
                margin-bottom: 0;
            }

            .program-row.disabled {
                opacity: 0.45;
            }

            .program-left {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 96px; /* wie Zones */
            }

            .color-dot {
                width: 16px;
                height: 16px;
                border-radius: 50%;
            }

            .program-center {
                flex: 1;
                min-width: 0;
                text-align: center;
            }

            .program-admin {
                display:flex;
                gap:6px;
            }

            .program-name {
                font-size: 15px;
                font-weight: 600;

                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .program-id {
                font-size: 12px;
                opacity: 0.5;
                margin-left: 6px;
            }

            .program-edit,
            .program-delete,
            .program-action {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 10px;
                cursor: pointer;
            }

            .program-edit ha-icon,
            .program-delete ha-icon {
                --mdc-icon-size: 28px;
                color: var(--secondary-text-color);
                opacity: 1;
            }

            .program-action.running ha-icon {
                color: #e53935;
                --mdc-icon-size: 28px;
            }
            
            .program-action.queued ha-icon {
                color: #fb8c00;
            }

            .program-row.running {
                border-color: #e53935;
            }

            .program-row.queued {
                border-color: #fb8c00;
            }

            .program-edit:hover,
            .program-delete:hover,
            .program-action:hover {
                background: rgba(0,0,0,0.05);
            }
            .program-action.running:hover ha-icon {
                color: #c62828;
            }

            .program-action:active {
                transform: scale(0.92);
            }

            .program-meta {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                opacity: 0.75;
                margin-top: 4px;
            }

            .program-meta ha-icon {
                --mdc-icon-size: 16px;
                opacity: 0.8;
            }

            .program-next {
                font-size: 13px;
                opacity: 0.6;
                margin-left: 6px;
                text-align: center;
            }
            .weather-active {
                color: var(--primary-color);
                opacity: 1;
            }

            .toggle-row {
                grid-template-columns: 1fr auto;
            }

            .separator {
                margin: 0 4px;
                opacity: 0.4;
            }
            /* =========================
                DETAIL VIEW
            ========================== */
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

            .detail-flat {
                padding: 4px 0;
            }

            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
            }

            .label {
                font-size: 13px;
                opacity: 0.6;
            }

            .value {
                font-size: 14px;
                font-weight: 500;
                text-align: right;
            }

            .divider {
                height: 1px;
                background: var(--divider-color);
                margin: 14px 0;
                opacity: 0.35;
            }

            /* =========================
                ZONES (Detail)
            ========================== */
            .zone-controls {
                display: flex;
                gap: 6px;
            }

            .zone-controls ha-icon {
                cursor: pointer;
                --mdc-icon-size: 20px;
                opacity: 0.6;
            }

            .zone-controls ha-icon:hover {
                opacity: 1;
            }

            .zone-duration.editable {
                cursor: pointer;
                font-family: monospace;
            }
            /* Column row */
            .detail-row.column {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }

            /* Radio group */
            .radio-group {
                display: flex;
                gap: 20px;
                font-size: 14px;
            }

            .radio-group label {
                display: flex;
                gap: 6px;
                align-items: center;
                cursor: pointer;
            }

            /* =========================
            MODE (RADIO CLEAN)
            ========================= */

            .mode-radio-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 6px;
            }

            .mode-radio {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                cursor: pointer;
            }

            .mode-radio input[type="radio"] {
                accent-color: var(--primary-color);
                margin: 0;
            }

            /* =========================
            WEEKDAY ROW (FULL WIDTH)
            ========================= */

            .weekday-row {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 6px;
                margin-top: 6px;
            }

            .weekday-chip {
                text-align: center;
                padding: 6px 0;
                border-radius: 14px;
                font-size: 12px;
                cursor: pointer;
                border: 1px solid var(--divider-color);
                background: white;
                transition: all 0.15s ease;
                user-select: none;
            }

            .weekday-chip.active {
                background: var(--primary-color);
                color: white;
                border-color: var(--primary-color);
            }

            .weekday-chip:hover {
                opacity: 0.85;
            }
            /* =========================
            COLOR PICKER
            ========================= */

            .color-picker-row {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
            }

            .color-label {
                font-size: 14px;
                opacity: 0.8;
            }
            .color-inline input[type="color"] {
                position: absolute;
                opacity: 0;
                width: 0;
                height: 0;
                pointer-events: none;
            }
            .color-dot-large {
                display: inline-block;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 1px solid var(--divider-color);
            }

            .color-inline {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .detail-block {
                background: white;
                border-radius: 14px;
                border: 1px solid #e6e6e6;

                padding: 16px;
                margin-bottom: 16px;
            }
            
            .detail-row {
                display: grid;
                grid-template-columns: 1fr auto;
                align-items: center;

                gap: 10px;
                padding: 10px 0;
            }
            .detail-row input,
            .detail-row select {
                font-size: 14px;
                padding: 6px 8px;

                border-radius: 8px;
                border: 1px solid var(--divider-color);
            }
            .zone-container {
                gap: 14px;
            }

            /* =========================
            POLICY SELECT
            ========================= */

            .policy-select {
                font-size: 13px;
                padding: 6px 8px;
                border-radius: 8px;
                border: 1px solid var(--divider-color);
                background: white;
            }

            /* =========================
            TITLE + COLOR INLINE
            ========================= */

            .title-row {
                flex: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
            }

            .title-text {
                font-size: 18px;
                font-weight: 600;
            }

            .title-inline-display {
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
            }

            .title-inline-input {
                min-width:0;
                width:100%;
            }
            
            .title-inline-wrapper {
                flex: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }

            /* =========================
            SCHEDULE BLOCK
            ========================= */

            .schedule-block {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .schedule-option {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 6px 8px;
                border-radius: 8px;
                cursor: pointer;
            }

            .schedule-option input[type="radio"] {
                margin: 0;
            }

            .schedule-option.active span {
                font-weight: 500;
            }

            .time-input {
                margin-left: auto;
                font-size: 14px;
                padding: 6px 8px;
                border-radius: 8px;
                border: 1px solid var(--divider-color);
            }

            .offset-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .offset-row input[type="range"] {
                flex: 1;
            }

            .offset-value {
                width: 60px;
                text-align: right;
                font-size: 13px;
                opacity: 0.7;
                font-variant-numeric: tabular-nums;
            }

            .offset-value {
                width: 60px;
                text-align: right;
                font-size: 13px;
                opacity: 0.7;
            }

            /* =========================
            ZONE CONTAINER
            ========================= */

            .zone-container {
                margin-top: 18px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            /* =========================
            ZONE CARD (GRID)
            ========================= */

            .zone-card {
                display: grid;
                grid-template-columns: 28px 1fr auto auto;
                grid-template-rows: auto auto;
                gap: 10px;
                padding: 12px;
                background: white;
                border-radius: 12px;
                border: 1px solid #e6e6e6;
                align-items: center;
                transition: transform 0.15s ease;
            }

            /* --- Drag Handle --- */

            .zone-handle {
                grid-row: 1 / span 2;
                grid-column: 1;

                display: flex;
                align-items: center;
                justify-content: center;

                width: 28px;

                cursor: grab;
                opacity: 0.45;
                touch-action: none;
                align-self: center;
                cursor: grab;
            }

            .zone-handle ha-icon {
                --mdc-icon-size: 20px;
            }
            
            .zone-handle:hover {
                opacity: 0.75;
            }

            .zone-handle:active {
                cursor:grabbing;
            }

            /* --- Zone Select (Zeile 1) --- */

            .zone-select {
                grid-column: 2 / 5;
                grid-row: 1;
                width: 100%;
                min-width: 0;
                padding: 6px 8px;
                border-radius: 8px;
                border: 1px solid var(--divider-color);
                font-weight: 500;
            }

            /* --- Slider (Zeile 2 links) --- */

            .slider-block {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .slider-block input[type="range"] {
                width: 100%;
            }

            .slider-block {
                width: 100%;
            }

            .slider-value {
                text-align: right;
                font-size: 13px;
                opacity: 0.7;
                font-variant-numeric: tabular-nums;
            }

            .zone-slider {
                grid-column: 2;
                grid-row: 2;
                width: 100%;
                touch-action: pan-x;
                margin-top: 4px;
            }

            .zone-slider input {
                width: 100%
            }

            /* --- Duration Label --- */

            .zone-duration-label {
                grid-column: 3;
                grid-row: 2;
                min-width: 55px;
                text-align: right;
                font-size: 13px;
                font-weight: 500;
                opacity: 0.65;
                font-variant-numeric: tabular-nums;
            }

            /* --- Delete Button --- */

            .zone-delete {
                grid-column: 4;
                grid-row: 2;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .zone-delete:hover {
                opacity: 1;
            }

            /* =========================
            ADD ROW
            ========================= */

            .zone-add-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-weight: 500;
            }

            .zone-add-row:hover {
                opacity: 1;
            }

            /* =========================
            DRAG STATE
            ========================= */

            .zone-card.dragging {
                opacity: 0.4;
                transform: scale(0.98);
            }

            .zone-drop-indicator {
                height: 4px;
                border-radius: 4px;
                background: var(--primary-color);
                margin: -4px 0 8px 0;
            }

            .validation-error {
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-4px); }
                to   { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;
    }

    // ----------------------------
    // RENDER ENTRY
    // ----------------------------

    render(programs = []) {

        if (this._view === "edit") {
            return this.renderDetail(programs);
        }

        return this.renderList(programs);
    }

    // ----------------------------
    // LIST VIEW
    // ----------------------------
    _formatNextRun(program) {

        const runtime = program.runtime;
        if (!runtime) return "";

        const state = runtime.state;

        // ----------------------------
        // RUNNING → Endzeit anzeigen
        // ----------------------------
        if (state === "running" && runtime.planned_end) {

            const end = new Date(runtime.planned_end);

            const time = end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            return `· bis ${time}`;
        }

        // ----------------------------
        // QUEUED → Startzeit anzeigen
        // ----------------------------
        if (state !== "queued" || !runtime.planned_start) {
            return "";
        }

        const start = new Date(runtime.planned_start);
        const now = new Date();

        const diffMs = start - now;
        if (diffMs <= 0) return "";

        const minutes = Math.round(diffMs / 60000);

        const time = start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        const today = now.toDateString();

        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(now.getDate() + 1);
        const tomorrow = tomorrowDate.toDateString();

        // ----------------------------
        // < 60 Minuten
        // ----------------------------
        if (minutes < 60) {
            return `· in ${minutes} min`;
        }

        // ----------------------------
        // heute
        // ----------------------------
        if (start.toDateString() === today) {
            return `· heute ${time}`;
        }

        // ----------------------------
        // morgen
        // ----------------------------
        if (start.toDateString() === tomorrow) {
            return `· morgen ${time}`;
        }

        // ----------------------------
        // fallback → weekday
        // ----------------------------
        const weekday = start.toLocaleDateString("de-DE", {
            weekday: "short"
        });

        return `· ${weekday} ${time}`;
    }

    renderList(programs = []) {

        const admin = isAdmin(this._hass);

        const titleBase =
            this._config?.title ||
            this._hass.states[this._config?.entity]?.attributes?.friendly_name ||
            "Programme";

        const title = this._isDev
            ? `${titleBase} (DEV)`
            : titleBase;

        return `
            <div class="card-header">
                <div class="title">${title}</div>

                ${admin ? `
                    <div class="add-btn" id="addProgramBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                ` : ""}
            </div>

            <div class="programs">
                ${programs.map(p => this.renderRow(p)).join("")}
            </div>
        `;
    }

    _validateProgram(program) {

        const errors = {};

        if (!program.zones || program.zones.length === 0) {
            errors.zones = "Mindestens eine Zone erforderlich.";
        }

        const ids = program.zones.map(z => z.zone_id);
        if (new Set(ids).size !== ids.length) {
            errors.zones = "Eine Zone darf nur einmal vorkommen.";
        }

        if (program.zones.some(z => !z.duration || z.duration <= 0)) {
            errors.zones = "Ungültige Laufzeit.";
        }

        if (!program.weekdays || program.weekdays.length === 0) {
            errors.weekdays = "Mindestens ein Wochentag erforderlich.";
        }

        if (program.schedule?.type === "fixed" && !program.schedule?.time) {
            errors.schedule = "Uhrzeit fehlt.";
        }

        return errors;
    }
    // ----------------------------
    // DETAIL VIEW
    // ----------------------------
    renderProgramHeader(program) {
        const schedule =
            program.schedule?.type === "fixed"
            ? `Fix ${program.schedule.time}`
            : `${program.schedule?.event || ""} ${program.schedule?.offset_minutes || 0} min`;
  
        return `
        <div class="detail-block">

            ${this._rowToggle("Aktiviert", "enabledSwitch", program.enabled)}
            ${this._rowToggle("Wetter", "weatherSwitch", program.weather?.enabled)}
            <div class="divider"></div>
            
            ${this._renderWeekdaySection(program)}
            ${this._validationErrors.weekdays ? `
                <div class="validation-error">
                    ${this._validationErrors.weekdays}
                </div>
            ` : ""}

            ${this._renderScheduleSection(program)}
            <div class="divider"></div>
            ${this._renderModeSection(program)}
            ${this._renderRepeatSection(program)}
        </div>
        `;
    }

    _rowToggle(label, id, checked) {
        return `
            <div class="detail-row toggle-row">
                <div class="label">${label}</div>
                <ha-switch id="${id}" ${checked ? "checked" : ""}></ha-switch>
            </div>
        `;
    }


    getAllSystemZones() {
        return Object.values(this._hass.states)
            .filter(e => {

                const prefix = this._config?.zones_prefix;
                if (!prefix) return false;

                if (!e.entity_id.startsWith(prefix + "_"))
                    return false;

                const attrs = e.attributes || {};

                // Nur echte Zonen
                if (attrs.enabled !== true)
                    return false;

                if (!attrs.zone_name)
                    return false;

                return true;
            })
            .map(e => ({
                id: Number(e.entity_id.split("_").pop()),
                zone_name: e.attributes.zone_name
            }))
            .sort((a, b) => a.id - b.id);
    }

    _renderWeekdaySection(program) {
        const days = ["mon","tue","wed","thu","fri","sat","sun"];
        const labels = {
            mon:"Mo", tue:"Di", wed:"Mi",
            thu:"Do", fri:"Fr", sat:"Sa", sun:"So"
        };

        const active = program.weekdays || [];

        return `
            <div class="weekday-row">
            ${days.map(d => `
                <div class="weekday-chip ${active.includes(d) ? "active" : ""}"
                    data-day="${d}">
                ${labels[d]}
                </div>
            `).join("")}
            </div>
        `;
    }

    _renderColorSection(program) {
        const color = program.color || "#4CAF50";

        return `
            <div class="divider"></div>

            <div class="detail-row">
            <div class="color-picker-row">
                <div class="color-dot-large"
                    style="background:${color}"
                    id="colorPreview">
                </div>

                <span class="color-label">Farbe</span>

                <input type="color"
                    id="colorInput"
                    value="${color}"
                    style="display:none;">
            </div>
            </div>
        `;
    }

    _renderModeSection(program) {
        const mode = program.mode || "start_at";

        return `
            <div class="mode-radio-row">

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="start_at"
                        ${mode === "start_at" ? "checked" : ""}>
                    Startet ab
                </label>

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="finish_at"
                        ${mode === "finish_at" ? "checked" : ""}>
                    Fertig bis
                </label>

            </div>
        `;
    }

    _renderScheduleSection(program) {
        const schedule = program.schedule || { type: "fixed", time: "06:00" };

        const isFixed = schedule.type === "fixed";
        const isSun = schedule.type === "sun";

        const event = schedule.event || "sunrise";
        const offset = schedule.offset_minutes || 0;

        return `
        <div class="divider"></div>

        <div class="schedule-block">

            <!-- FIX -->
            <label class="schedule-option ${isFixed ? "active" : ""}">
                <input type="radio"
                    name="scheduleType"
                    value="fixed"
                    ${isFixed ? "checked" : ""}>
                <span>Fixe Uhrzeit</span>

                <input type="time"
                    id="scheduleTimeInput"
                    class="time-input"
                    value="${schedule.time || "06:00"}"
                    ${!isFixed ? "disabled" : ""}>
            </label>

            <!-- SUNRISE -->
            <label class="schedule-option ${isSun && event === "sunrise" ? "active" : ""}">
                <input type="radio"
                    name="scheduleType"
                    value="sunrise"
                    ${isSun && event === "sunrise" ? "checked" : ""}>
                <span>Sonnenaufgang</span>
            </label>

            <!-- SUNSET -->
            <label class="schedule-option ${isSun && event === "sunset" ? "active" : ""}">
                <input type="radio"
                    name="scheduleType"
                    value="sunset"
                    ${isSun && event === "sunset" ? "checked" : ""}>
                <span>Sonnenuntergang</span>
            </label>

            <!-- OFFSET -->
            <div class="label">Offset</div>
            <div class="offset-row ${isSun ? "" : "disabled"}">
                <input type="range"
                    id="scheduleOffsetInput"
                    min="-120"
                    max="120"
                    step="5"
                    value="${offset}">

                <div class="offset-value">
                    ${offset} min
                </div>
            </div>

        </div>
        `;
    }

    _renderRepeatSection(program) {

        const repeat = program.repeat ?? 0;
        const pause = program.pause_minutes ?? 0;

        return `
            <div class="divider"></div>

            <div class="detail-row">
                <div class="label">Wiederholungen</div>

                <input
                    type="number"
                    id="repeatInput"
                    min="0"
                    max="10"
                    value="${repeat}"
                    style="width:70px">
            </div>

            <div class="detail-row">
                <div class="label">Pause (min)</div>

                <input
                    type="number"
                    id="pauseInput"
                    min="0"
                    max="720"
                    value="${pause}"
                    style="width:70px">

            </div>
        `;
    }
    
    // ----------------------------
    // ZONES 
    // ----------------------------

    renderProgramZoneRow(zoneEntry, index, allZones) {

        // 🔥 Alle anderen bereits vergebenen Zonen (ohne eigene Zeile)
        const usedByOthers = new Set(
            this._workingProgram.zones
                .filter((z, idx) => idx !== index)
                .map(z => z.zone_id)
                .filter(id => id != null)
        );

        // 🔥 Nur erlaubte Zonen anzeigen
        const availableZones = allZones
            .filter(z => z.id === zoneEntry.zone_id || !usedByOthers.has(z.id))
            .sort((a, b) =>
                a.zone_name.localeCompare(
                    b.zone_name,
                    "de",
                    { sensitivity: "base" }
                )
            );

        const durationMin = Math.round((zoneEntry.duration || 60) / 60);

        return `
        <div class="zone-card" data-index="${index}">

            <div class="zone-handle" draggable="true">
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
            </div>

            <select class="zone-select" data-index="${index}">
                ${availableZones.length === 0 ? `
                    <option value="">Keine Zone verfügbar</option>
                ` : availableZones.map(z => `
                    <option value="${z.id}"
                        ${z.id === zoneEntry.zone_id ? "selected" : ""}>
                        ${z.zone_name}
                    </option>
                `).join("")}
            </select>

            <div class="slider-block zone-slider" data-index="${index}">
                <input type="range"
                    min="1"
                    max="120"
                    step="1"
                    value="${durationMin}">
            </div>

            <div class="zone-duration-label" data-index="${index}">
                ${durationMin} min
            </div>

            <ha-icon icon="mdi:trash-can-outline"
                    class="zone-delete"
                    data-index="${index}"></ha-icon>

        </div>
        `;
    }

    renderProgramZones(program) {

        const allZones = this.getAllSystemZones();

        let html = program.zones
            .map((z, i) => this.renderProgramZoneRow(z, i, allZones))
            .join("");

        if (allZones.length > 0 && program.zones.length < allZones.length) {
            html += `
            <div class="zone-add-row">
                <ha-icon icon="mdi:plus"></ha-icon>
                Neue Zone hinzufügen
            </div>
            `;
        }

        return `<div class="zone-container">${html}</div>`;
    }

    renderDetail(programs = []) {

        let program;

        if (this._isNewProgram) {
            program = this._workingProgram;
        } else {
            program = programs.find(p => p.id === this._selectedProgramId);
            if (!program) return `<div>Programm nicht gefunden</div>`;

            if (!this._workingProgram || this._workingProgram.id !== program.id) {
                this._workingProgram = JSON.parse(JSON.stringify(program));
            }
        }

        return `
            <div class="card-header">

                <div class="back-btn" id="backBtn">
                    <ha-icon icon="mdi:arrow-left"></ha-icon>
                </div>

                <div class="title-row">
                    <label class="color-inline">
                        <input type="color"
                            id="colorInput"
                            value="${this._workingProgram.color || '#4CAF50'}">
                        <span class="color-dot-large"
                            style="background:${this._workingProgram.color}">
                        </span>
                    </label>

                    <div class="title-inline-wrapper">
                        <span id="programNameDisplay" class="title-inline-display">
                            ${this._workingProgram.name}
                        </span>
                        <input id="programNameInput"
                            class="title-inline-input"
                            type="text"
                            value="${this._workingProgram.name}"
                            style="display:none;" />
                    </div>
                </div>

                <div class="save-btn" id="saveBtn">
                    <ha-icon icon="mdi:content-save-outline"></ha-icon>
                </div>

            </div>

            <div class="detail-content">
                ${this.renderProgramHeader(this._workingProgram)}
                ${this.renderProgramZones(this._workingProgram)}
            </div>
        `;
    }

    // ----------------------------
    // ROW
    // ----------------------------
    renderRow(program) {

        const admin = isAdmin(this._hass);
        const color = program.color || "#9e9e9e";
        const disabledClass = program.enabled ? "" : "disabled";
        const state = program.runtime?.state || "idle";

        const isRunning = state === "running";
        const isQueued  = state === "queued";
        const runtime = program.runtime || {};

        let icon = "mdi:play-circle-outline";
        let actionClass = "";

        if (isRunning) {
            icon = "mdi:stop-circle-outline";
            actionClass = "running";
        }

        const nextText = this._formatNextRun(program);

        const modeIcon =
            program.mode === "finish_at"
                ? "mdi:flag-checkered"
                : "mdi:play-circle-outline";

        let scheduleIcon = "";
        let scheduleText = "";

        const schedule = program.schedule || {};

        if (schedule.type === "fixed") {
            scheduleIcon = "mdi:clock-outline";
            scheduleText = schedule.time || "--:--";
        }

        if (schedule.type === "sun") {
            scheduleIcon =
                schedule.event === "sunrise"
                    ? "mdi:weather-sunset-up"
                    : "mdi:weather-sunset-down";

            const offset = schedule.offset_minutes || 0;

            scheduleText =
                offset === 0 ? "" : (offset > 0 ? `+${offset}m` : `${offset}m`);
        }

        const weekdayOrder = ["mon","tue","wed","thu","fri","sat","sun"];

        const labels = {
            mon: "Mo", tue: "Di", wed: "Mi",
            thu: "Do", fri: "Fr", sat: "Sa", sun: "So"
        };

        const weekdayText = (program.weekdays || [])
            .sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b))
            .map(d => labels[d])
            .join(" ");

        return `
            <div class="program-row ${disabledClass}" data-id="${program.id}">

                <div class="program-left">
                    <div class="color-dot" style="background:${color}"></div>

                    ${admin ? `
                    <div class="program-admin">
                        <div class="program-delete" data-id="${program.id}">
                            <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </div>
                        <div class="program-edit" data-id="${program.id}">
                            <ha-icon icon="mdi:cog-outline"></ha-icon>
                        </div>
                    </div>
                    `: ""}
                </div>

                <div class="program-center">

                    <div class="program-name">
                        ${program.name}
                    </div>

                    <div class="program-meta">

                        <ha-icon icon="${modeIcon}"></ha-icon>

                        <ha-icon icon="${scheduleIcon}"></ha-icon>
                        <span>${scheduleText}</span>

                        ${weekdayText ? `
                            <span class="separator">•</span>
                            <ha-icon icon="mdi:calendar"></ha-icon>
                            <span>${weekdayText}</span>
                        ` : ""}
                        ${nextText}
                    </div>

                </div>

                <div class="program-action ${actionClass}"
                    data-id="${program.id}"
                    data-state="${state}"
                    data-run-id="${runtime.program_run_id || ""}">
                    <ha-icon icon="${icon}"></ha-icon>
                </div>
            </div>
        `;
    }

    // ----------------------------
    // EVENTS
    // ----------------------------

    attachEvents() {

        // EDIT
        this.querySelectorAll(".program-edit").forEach(el => {
            el.addEventListener("click", e => {

                this._selectedProgramId = Number(e.currentTarget.dataset.id);
                this._view = "edit";

                this._renderInternal(this.getData());
            });
        });

        // DELETE
        this.querySelectorAll(".program-delete").forEach(el => {
            el.addEventListener("click", e => {

                const id = Number(e.currentTarget.dataset.id);

                openConfirmDialog({
                    title: "Programm löschen",
                    text: "Wirklich löschen?",
                    confirmText: "Löschen",
                    danger: true,
                    parent: document.body,
                    onConfirm: () => {
                        callServiceWithRequest(
                            this,
                            "sprinkler_ui_program_delete",
                            { program_id: id }
                        );
                    }
                });
            });
        });

        // ADD
        this.querySelector("#addProgramBtn")?.addEventListener("click", () => {

            this._workingProgram = {
                name: "Neues Programm",
                enabled: true,
                mode: "start_at",
                policy: "strict",
                weekdays: [],
                schedule: { type: "fixed", time: "06:00" },
                weather: { enabled: false },

                repeat: 0,
                pause_minutes: 0,

                zones: []
            };

            this._isNewProgram = true;
            this._view = "edit";

            this._renderInternal(this.getData());
        });

        // ----------------------------
        // PROGRAM ACTION (PLAY / STOP)
        // ----------------------------
        this.querySelectorAll(".program-action").forEach(el => {

            let pressTimer = null;
            let longPressTriggered = false;
            const LONG_PRESS_MS = 500;
            const state = el.dataset.state;
            const runId = el.dataset.runId;

            // ----------------------------
            // LONG PRESS START
            // ----------------------------
            const startPress = () => {
                const id = Number(el.dataset.id);
                longPressTriggered = false;

                pressTimer = setTimeout(() => {

                    // 👉 nur bei queued sinnvoll
                    if (state === "queued" && runId) {

                        longPressTriggered = true;

                        callServiceWithRequest(
                            this,
                            "sprinkler_ui_program_skip",
                            { program_id: id }
                        );

                    }

                }, LONG_PRESS_MS);
            };

            // ----------------------------
            // PRESS END
            // ----------------------------
            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            // ----------------------------
            // CLICK (nur wenn kein long press)
            // ----------------------------
            el.addEventListener("click", e => {
                if (longPressTriggered) {
                    return; // 👉 verhindert doppelte Aktion
                }
                const id = Number(el.dataset.id);
                const state = el.dataset.state;
                const runId = el.dataset.runId;
                // optional: Name holen (nice UX)
                const entityId = this.config?.entity;
                const sensor = this._hass.states[entityId];
                const program = sensor?.attributes?.programs?.find(p => p.id === id);
                const name = program?.name;

                if (!runId) this.return;

                if (state === "running") {
                    openConfirmDialog({
                        title: "Programm stoppen",
                        text: "Programm wirklich stoppen?",
                        entityName: name,
                        confirmText: "Stoppen",
                        danger: true,
                        parent: document.body,
                        onConfirm: () => {

                            callServiceWithRequest(
                                this,
                                "sprinkler_ui_program_stop",
                                { program_run_id: runId }
                            );

                        }
                    });
                    // 🔴 STOP
                    callServiceWithRequest(
                        this,
                        "sprinkler_ui_program_stop",
                        { program_id: id }
                    );

                } else {

                    // 🟢 START (auch bei queued = adhoc!)
                    callServiceWithRequest(
                        this,
                        "sprinkler_ui_program_start",
                        { program_id: id }
                    );
                }
            });
            // ----------------------------
            // POINTER EVENTS (wichtig für mobile!)
            // ----------------------------
            el.addEventListener("pointerdown", startPress);
            el.addEventListener("pointerup", cancelPress);
            el.addEventListener("pointerleave", cancelPress);
            el.addEventListener("pointercancel", cancelPress);
        });


    }

    _attachEditEvents() {
        // BACK
        this.querySelector("#backBtn")?.addEventListener("click", () => {
            this._view = "list";
            this._selectedProgramId = null;
            this._workingProgram = null;
            this._isNewProgram = false;
            this._lastHash = null;
            this.hass = this._hass;
        });

        // SAVE
        this.querySelector("#saveBtn")?.addEventListener("click", async () => {

//            const p = this._workingProgram;

            const raw = this._workingProgram;

            const p = {
                id: raw.id,
                name: raw.name,
                color: raw.color,
                enabled: raw.enabled,
                policy: raw.policy,
                weekdays: raw.weekdays,
                schedule: raw.schedule,
                weather: raw.weather,
                mode: raw.mode,
                repeat: raw.repeat,
                pause_minutes: raw.pause_minutes,
                zones: raw.zones
            };

            this._validationErrors = this._validateProgram(p);

            if (Object.keys(this._validationErrors).length > 0) {
                this.renderDetail();   // 🔥 Fehler anzeigen
                return;
            }
            console.log(p)
            try {
                if (this._isNewProgram) {
                    callServiceWithRequest(this, "sprinkler_ui_program_add", { program: p });
                } else {
                    callServiceWithRequest(this, "sprinkler_ui_program_update", { program: p });
                }
                this._isNewProgram = false;

                this._view = "list";
                this._selectedProgramId = null;
                this._lastHash = null;
                this.hass = this._hass;

            } catch (err) {
                console.error("Save failed:", err);
            }
        });
        // ----------------------------
        // NAME (inline edit)
        // ----------------------------
        const nameDisplay = this.querySelector("#programNameDisplay");
        const nameInput = this.querySelector("#programNameInput");

        nameDisplay?.addEventListener("click", () => {
            nameDisplay.style.display = "none";
            nameInput.style.display = "block";
            nameInput.focus();
        });

        nameInput?.addEventListener("blur", () => {
            this._workingProgram.name = nameInput.value;
            this._renderInternal(this.getData());
        });

        // ----------------------------
        // COLOR
        // ----------------------------
        this.querySelector("#colorInput")?.addEventListener("input", e => {
            this._workingProgram.color = e.target.value;
            this._renderInternal(this.getData());
        });

        // ----------------------------
        // ENABLE / WEATHER
        // ----------------------------
        this.querySelector("#enabledSwitch")?.addEventListener("change", e => {
            this._workingProgram.enabled = e.target.checked;
        });

        this.querySelector("#weatherSwitch")?.addEventListener("change", e => {
            this._workingProgram.weather = {
                ...(this._workingProgram.weather || {}),
                enabled: e.target.checked
            };
        });

        // ----------------------------
        // WEEKDAYS
        // ----------------------------
        this.querySelectorAll(".weekday-chip").forEach(el => {
            el.addEventListener("click", () => {

                const day = el.dataset.day;
                let days = this._workingProgram.weekdays || [];

                if (days.includes(day)) {
                    days = days.filter(d => d !== day);
                } else {
                    days = [...days, day];
                }

                this._workingProgram.weekdays = days;
                this._renderInternal(this.getData());
            });
        });

        // ----------------------------
        // SCHEDULE TYPE
        // ----------------------------
        this.querySelectorAll('input[name="scheduleType"]').forEach(el => {
            el.addEventListener("change", e => {

                const value = e.target.value;

                if (value === "fixed") {
                    this._workingProgram.schedule = {
                        type: "fixed",
                        time: this._workingProgram.schedule?.time || "06:00"
                    };
                } else {
                    this._workingProgram.schedule = {
                        type: "sun",
                        event: value,
                        offset_minutes: this._workingProgram.schedule?.offset_minutes || 0
                    };
                }

                this._renderInternal(this.getData());
            });
        });

        // ----------------------------
        // TIME INPUT
        // ----------------------------
        this.querySelector("#scheduleTimeInput")?.addEventListener("input", e => {
            if (!this._workingProgram.schedule) return;
            this._workingProgram.schedule.time = e.target.value;
        });

        // ----------------------------
        // OFFSET
        // ----------------------------
        this.querySelector("#scheduleOffsetInput")?.addEventListener("input", e => {
            if (!this._workingProgram.schedule) return;

            const value = Number(e.target.value);
            this._workingProgram.schedule.offset_minutes = value;

            const label = this.querySelector(".offset-value");
            if (label) label.textContent = value === 0
                ? "0 min"
                : value > 0
                    ? `+${value} min`
                    : `${value} min`;
        });

        // ----------------------------
        // MODE
        // ----------------------------
        this.querySelectorAll('input[name="programMode"]').forEach(el => {
            el.addEventListener("change", e => {
                this._workingProgram.mode = e.target.value;
            });
        });

        // ----------------------------
        // REPEAT / PAUSE
        // ----------------------------
        this.querySelector("#repeatInput")?.addEventListener("input", e => {
            this._workingProgram.repeat = Number(e.target.value);
        });

        this.querySelector("#pauseInput")?.addEventListener("input", e => {
            this._workingProgram.pause_minutes = Number(e.target.value);
        });

        // ----------------------------
        // ZONES: SELECT
        // ----------------------------
        this.querySelectorAll(".zone-select").forEach(el => {
            el.addEventListener("change", e => {

                const index = Number(e.target.dataset.index);
                const zoneId = Number(e.target.value);

                this._workingProgram.zones[index].zone_id = zoneId;

                this._renderInternal(this.getData());
            });
        });

        // ----------------------------
        // ZONES: SLIDER
        // ----------------------------
        this.querySelectorAll(".zone-slider input").forEach((el, idx) => {
            el.addEventListener("input", e => {

                const index = Number(e.target.closest(".zone-slider").dataset.index);
                const minutes = Number(e.target.value);

                this._workingProgram.zones[index].duration = minutes * 60;

                // nur label updaten → kein full rerender nötig
                const label = this.querySelector(
                    `.zone-duration-label[data-index="${index}"]`
                );
                if (label) label.textContent = `${minutes} min`;
            });
        });

        // ----------------------------
        // ZONES: DELETE
        // ----------------------------
        this.querySelectorAll(".zone-delete").forEach(el => {
            el.addEventListener("click", e => {

                const index = Number(e.target.dataset.index);

                this._workingProgram.zones.splice(index, 1);
                this._renderInternal(this.getData());
            });
        });

        // ----------------------------
        // ZONES: ADD
        // ----------------------------
        this.querySelector(".zone-add-row")?.addEventListener("click", () => {

            this._workingProgram.zones.push({
                zone_id: null,
                duration: 600
            });

            this._renderInternal(this.getData());
        });

        // ----------------------------
        // ZONES: DRAG & DROP (HANDLE ONLY)
        // ----------------------------

        let dragIndex = null;

        // 👉 HANDLE = Start
        this.querySelectorAll(".zone-handle").forEach(handle => {

            const card = handle.closest(".zone-card");

            handle.addEventListener("dragstart", () => {
                dragIndex = Number(card.dataset.index);
                card.classList.add("dragging");
            });

            handle.addEventListener("dragend", () => {
                card.classList.remove("dragging");

                this.querySelectorAll(".zone-drop-indicator")
                    .forEach(el => el.remove());
            });

        });

        // 👉 CARD = Drop Targets
        this.querySelectorAll(".zone-card").forEach(card => {

            card.addEventListener("dragover", e => {
                e.preventDefault();

                const targetIndex = Number(card.dataset.index);

                if (targetIndex === dragIndex) return;

                // remove old indicators
                this.querySelectorAll(".zone-drop-indicator")
                    .forEach(el => el.remove());

                const rect = card.getBoundingClientRect();
                const isBelow = e.clientY > rect.top + rect.height / 2;

                const indicator = document.createElement("div");
                indicator.className = "zone-drop-indicator";

                if (isBelow) {
                    card.after(indicator);
                } else {
                    card.before(indicator);
                }
            });

            card.addEventListener("drop", e => {
                e.preventDefault();

                const targetIndex = Number(card.dataset.index);

                if (dragIndex === null || targetIndex === dragIndex) return;

                const rect = card.getBoundingClientRect();
                const isBelow = e.clientY > rect.top + rect.height / 2;

                let insertIndex = targetIndex;
                if (isBelow) insertIndex++;

                const zones = [...this._workingProgram.zones];
                const [moved] = zones.splice(dragIndex, 1);

                if (dragIndex < insertIndex) insertIndex--;

                zones.splice(insertIndex, 0, moved);

                this._workingProgram.zones = zones;

                dragIndex = null;

                this._renderInternal(this.getData());
            });

        });

    }
    getCardSize() {
        return 4;
    }
}

customElements.define(
    "sprinklerv2-programs-card-v2",
    SprinklerProgramsCardV2
);