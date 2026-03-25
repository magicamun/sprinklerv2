import { registerSprinklerFeedback } from "./sprinklerv2-events.js";
import { callServiceWithRequest } from "./sprinklerv2-events.js";
import { isAdmin } from "./sprinklerv2-utils.js";

const IS_DEV = import.meta.env?.DEV === true;
console.log(
    IS_DEV
    ? "🚀 SPRINKLER PROGRAMS CARD (DEV BUILD)"
    : "🚀 SPRINKLER PROGRAMS CARD"
);

class SprinklerProgramsCardBase extends HTMLElement {

    constructor() {
        super();
        this._isDev = IS_DEV;
        this._view = "list";
        this._selectedProgramId = null;
        this._validationErrors = {};
        this._activeDialog = null;
    }

    connectedCallback() {
        if (this._hass) {
            registerSprinklerFeedback(this._hass);
        }
                
        requestAnimationFrame(() => {
            const card = this.querySelector("ha-card");
            const w = card.getBoundingClientRect().width;
            card.style.maxWidth = `${w}px`;
        });

        this._hass.connection.subscribeEvents(
            (event) => {

                const data = event.data;

                console.log("Event data:", data);
                console.log("Pending:", this._pendingRequestId);

                if (!data) return;

                // 🔥 Nur eigene Requests behandeln
                if (data.request_id !== this._pendingRequestId) return;
                if (data.user_id && data.user_id !== this._hass.user?.id) return;

                // 🔥 Timeout stoppen
                this._pendingRequestId = null;

                if (this._requestTimeout) {
                    clearTimeout(this._requestTimeout);
                    this._requestTimeout = null;
                }

            },
            "sprinkler_ui_feedback"
        ).then(unsub => {
            this._unsubscribe = unsub;
        });
    }

    disconnectedCallback() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Program entity (entity) is required");
        }

        this.config = {
            ...config,

            // Default: aus Program-Entity ableiten
            zones_prefix:
                config.zones_prefix ??
                config.entity.replace(/_programs?.*$/i, "_zone")
        };

        this._lastHash = null;
    }


    _lockWidth() {
        const card = this.querySelector("ha-card");
        if (!card) return;

        const parent = this.parentElement;
        if (!parent) return;

        const w = parent.getBoundingClientRect().width;

        card.style.maxWidth = `${w}px`;
        card.style.width = "100%";
    }

    _closeActiveDialog() {
        if (!this._activeDialog) return;

        this._activeDialog.open = false;
        this._activeDialog.remove();
        this._activeDialog = null;
    }
    
    _getZoneEntity(zoneId) {
        const prefix = this.config?.zones_prefix;
        if (!prefix) return null;

        const entityId =
            `${prefix}_${String(zoneId).padStart(2,"0")}`;

        return this._hass.states[entityId] || null;
    }

    _formatDuration(seconds) {
        seconds = Number(seconds) || 0;

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        return `${h.toString().padStart(2,"0")}:` +
                `${m.toString().padStart(2,"0")}:` +
                `${s.toString().padStart(2,"0")}`;
    }

    _formatNextRun(program) {

        let ts;

        if (program.runtime?.state === "running") {
            ts = program.runtime?.planned_end;
        } else {
            ts = program.runtime?.planned_start;
        }
        if (!ts) return "";

        const now = new Date();
        const start = new Date(ts);

        const diff = start - now;
        if (diff <= 0) return "";

        const minutes = Math.round(diff / 60000);

        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        const time = start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        if (program.runtime?.state === "running") {
            const end = new Date(program.runtime?.planned_end);

            const time = end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            return `· bis ${time}`;
        }

        // heute
        if (start.toDateString() === today.toDateString()) {

            if (minutes < 60) {
            return `· in ${minutes} min`;
            }

            return `· heute ${time}`;
        }

        // morgen
        if (start.toDateString() === tomorrow.toDateString()) {
            return `· morgen ${time}`;
        }

        // fallback → weekday
        const weekday = start.toLocaleDateString("de-DE", {
            weekday: "short"
        });

        return `· ${weekday} ${time}`;
    }

    _moveZone(index, direction) {
        const zones = this._workingProgram.zones;

        const newIndex = index + direction;

        if (newIndex < 0 || newIndex >= zones.length) return;

        const temp = zones[index];
        zones[index] = zones[newIndex];
        zones[newIndex] = temp;

        this.renderDetail();
    }

    _attachDetailEvents() {
        // Mode change
        this.querySelectorAll("input[name='programMode']").forEach(el => {
            el.addEventListener("change", e => {
                this._workingProgram.mode = e.target.value;
                this.renderDetail();
            });
        });

        // Weekday toggle
        this.querySelectorAll(".weekday-chip").forEach(el => {
            el.addEventListener("click", e => {
                const day = e.currentTarget.dataset.day;

                const list = this._workingProgram.weekdays || [];

                if (list.includes(day)) {
                this._workingProgram.weekdays =
                    list.filter(d => d !== day);
                } else {
                this._workingProgram.weekdays =
                    [...list, day];
                }
                this.renderDetail();
            });
        });        
        this.querySelector("#backBtn")?.addEventListener("click", () => {
            this._view = "list";
            this._selectedProgramId = null;
            this._workingProgram = null;
            this._isNewProgram = false;
            this._lastHash = null;
            this.hass = this._hass;
        });

        // Policy change
        this.querySelector("#policySelect")?.addEventListener("change", e => {
            this._workingProgram.policy = e.target.value;
        });

        // Color change
        this.querySelector("#colorInput")?.addEventListener("input", e => {
            this._workingProgram.color = e.target.value;
            this.renderDetail();
        });

        // Enabled toggle
        this.querySelector("#enabledSwitch")?.addEventListener("change", e => {
            this._workingProgram.enabled = e.target.checked;
        });

        // Weather toggle
        this.querySelector("#weatherSwitch")?.addEventListener("change", e => {
            this._workingProgram.weather = {
                ...this._workingProgram.weather,
                enabled: e.target.checked
            };
        });

        this.querySelector("#repeatInput")?.addEventListener("change", e => {

            const val = Math.max(0, Number(e.target.value) || 0);

            this._workingProgram.repeat = val;

            if (val === 0) {
                this._workingProgram.pause_minutes = 0;
            }

        });

        this.querySelector("#pauseInput")?.addEventListener("change", e => {

            const val = Math.max(0, Number(e.target.value) || 0);

            this._workingProgram.pause_minutes = val;

        });

        const nameDisplay = this.querySelector("#programNameDisplay");
        const nameInput = this.querySelector("#programNameInput");

        nameDisplay?.addEventListener("click", () => {
            nameDisplay.style.display = "none";
            nameInput.style.display = "inline-block";
            nameInput.focus();
            nameInput.select();
        });

        const finishEdit = () => {
            const newName = nameInput.value.trim() || "Ohne Name";
            this._workingProgram.name = newName;
            nameDisplay.innerText = newName;
            nameInput.style.display = "none";
            nameDisplay.style.display = "inline-block";
        };

        nameInput?.addEventListener("keydown", e => {
            if (e.key === "Enter") finishEdit();
        });

        nameInput?.addEventListener("blur", finishEdit);

        // Save
        this.querySelector("#saveBtn")?.addEventListener("click", async () => {

            const p = this._workingProgram;

            this._validationErrors = this._validateProgram(p);

            if (Object.keys(this._validationErrors).length > 0) {
                this.renderDetail();   // 🔥 Fehler anzeigen
                return;
            }

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

        // Schedule type change
        this.querySelectorAll("input[name='scheduleType']").forEach(el => {
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

                this.renderDetail();
            });
        });

        // Fixed time
        this.querySelector("#scheduleTimeInput")?.addEventListener("change", e => {
            this._workingProgram.schedule.time = e.target.value;
        });

        // Offset slider
        this.querySelector("#scheduleOffsetInput")?.addEventListener("input", e => {
            const val = Number(e.target.value);

            this._workingProgram.schedule = {
                ...this._workingProgram.schedule,
                type: "sun",
                offset_minutes: val
            };

            this.querySelector(".offset-value").innerText = `${val} min`;
        });

        this.querySelectorAll(".zone-delete").forEach(el => {
            el.addEventListener("click", e => {
                const i = Number(e.currentTarget.dataset.index);
                this._workingProgram.zones.splice(i, 1);
                this.renderDetail();
            });
        });

        this.querySelectorAll(".zone-slider").forEach(el => {

            el.addEventListener("input", e => {

                const i = Number(e.target.dataset.index);
                const minutes = Number(e.target.value);

                // 120 Minuten max pro Zone
                const finalMinutes = Math.min(minutes, 120);

                this._workingProgram.zones[i].duration = finalMinutes * 60;

                e.target.value = finalMinutes;

                this.querySelectorAll(".zone-duration-label")[i]
                    .innerText = `${finalMinutes} min`;
            });

        });

        this.querySelectorAll(".zone-select").forEach(el => {
            el.addEventListener("change", e => {

                const i = Number(e.target.dataset.index);
                this._workingProgram.zones[i].zone_id = Number(e.target.value);

                // 🔥 Wichtig: neu rendern damit andere Dropdowns neu gefiltert werden
                this.renderDetail();
            });
        });

        this.querySelector(".zone-add-row")?.addEventListener("click", () => {
            const allZones = this.getAllSystemZones();
            const assigned = this._workingProgram.zones.map(z => z.zone_id);
            const next = allZones.find(z => !assigned.includes(z.id));
            if (!next) return;

            this._workingProgram.zones.push({
                zone_id: next.id,
                duration: 600
            });

            this.renderDetail();
        });
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

    _attachDragAndDrop() {

        const handles = this.querySelectorAll(".zone-handle");
        if (!handles.length) return;

        let dragIndex = null;
        let indicator = null;
        let startY = null;
        let isDragging = false;

        const DRAG_THRESHOLD = 6;

        const createIndicator = () => {
            const div = document.createElement("div");
            div.className = "zone-drop-indicator";
            return div;
        };

        handles.forEach(handle => {

            handle.addEventListener("pointerdown", e => {

                // Nur reagieren wenn wirklich Handle getroffen wurde
                if (!e.target.closest(".zone-handle")) return;

                dragIndex = Number(handle.closest(".zone-card").dataset.index);
                startY = e.clientY;
                isDragging = false;
            });

            window.addEventListener("pointermove", e => {

                if (dragIndex === null) return;

                const delta = Math.abs(e.clientY - startY);

                if (!isDragging) {
                    if (delta < DRAG_THRESHOLD) return;

                    isDragging = true;
                    this.querySelectorAll(".zone-card")[dragIndex]
                        .classList.add("dragging");
                }

                const cards = [...this.querySelectorAll(".zone-card")];
                const y = e.clientY;

                for (let card of cards) {

                    const rect = card.getBoundingClientRect();

                    if (y < rect.top + rect.height / 2) {

                        if (!indicator)
                            indicator = createIndicator();

                        card.parentNode.insertBefore(indicator, card);
                        return;
                    }
                }

                if (!indicator)
                    indicator = createIndicator();

                cards[cards.length - 1].after(indicator);
            });

            window.addEventListener("pointerup", () => {

                if (dragIndex === null) return;

                if (!isDragging) {
                    dragIndex = null;
                    return;
                }

                const zones = this._workingProgram.zones;
                const moved = zones.splice(dragIndex, 1)[0];

                const cards = [...this.querySelectorAll(".zone-card")];

                let dropIndex = zones.length;

                if (indicator) {
                    const next = indicator.nextElementSibling;
                    dropIndex = cards.indexOf(next);
                    if (dropIndex < 0) dropIndex = zones.length;
                    indicator.remove();
                    indicator = null;
                }

                zones.splice(dropIndex, 0, moved);

                dragIndex = null;
                isDragging = false;

                this.renderDetail();
            });

        });
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

    styles() {
    return `
        <style>

            /* =========================
                CARD BASE
            ========================== */
            * {
                min-width: 0;
                box-sizing: border-box;
            }

            :host {
                display: block;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                box-sizing: border-box;

                overflow: hidden;
            }

            ha-card {
                background: #f6f7f8;
                padding: 10px;

                min-width: 0;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                box-sizing: border-box;
            }

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 14px 14px 14px;
                min-width: 0;
            }

            .title {
                font-size: 18px;
                font-weight: 600;
            }

            /* =========================
                HEADER ACTION BUTTONS
            ========================== */
            .add-btn,
            .back-btn,
            .save-btn {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 10px;
                flex-shrink: 0;
            }

            .save-btn {
                flex-shrink:0;
            }
            .add-btn ha-icon {
                --mdc-icon-size: 28px;
                color: var(--primary-color);
            }

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
                width: 32px;
                display: flex;
                justify-content: center;
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

            .program-action ha-icon {
                color: #e53935;
                --mdc-icon-size: 28px;
            }
            .program-edit:hover,
            .program-delete:hover,
            .program-action:hover {
                background: rgba(0,0,0,0.05);
            }
            .program-action.running:hover ha-icon {
                color: #c62828;
            }
            .program-meta {
                display: flex;
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

            .offset-row.disabled {
                opacity: 0.4;
                pointer-events: none;
            }

            .offset-row input[type="range"] {
                flex: 1;
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
                grid-template-columns: 28px minmax(0,1fr) auto auto;
                grid-template-rows: auto auto;
                gap: 8px;
                padding: 12px;
                background: white;
                border-radius: 12px;
                border: 1px solid #e6e6e6;
                align-items: center;
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
            }

            .zone-handle ha-icon {
                --mdc-icon-size: 20px;
            }
            
            .zone-handle:hover {
                opacity: 0.75;
            }

            /* --- Zone Select (Zeile 1) --- */

            .zone-select {
                grid-column: 2 / span 3;
                grid-row: 1;
                width: 100%;
                min-width: 0;
                padding: 6px 8px;
                border-radius: 8px;
                border: 1px solid var(--divider-color);
            }

            /* --- Slider (Zeile 2 links) --- */

            .zone-slider {
                grid-column: 2;
                grid-row: 2;
                width: 100%;
                touch-action: pan-x;
            }

            /* --- Duration Label --- */

            .zone-duration-label {
                grid-column: 3;
                grid-row: 2;
                min-width: 55px;
                text-align: right;
                font-size: 13px;
                opacity: 0.7;
            }

            /* --- Delete Button --- */

            .zone-delete {
                grid-column: 4;
                grid-row: 2;
                cursor: pointer;
                opacity: 0.6;
            }

            .zone-delete:hover {
                opacity: 1;
            }

            /* =========================
            ADD ROW
            ========================= */

            .zone-add-row {
                padding: 12px;
                text-align: center;
                border-radius: 10px;
                border: 1px dashed var(--divider-color);
                cursor: pointer;
                opacity: 0.6;
            }

            .zone-add-row:hover {
                opacity: 1;
            }

            /* =========================
            DRAG STATE
            ========================= */

            .zone-card.dragging {
                opacity: 0.5;
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

    set hass(hass) {
        this._hass = hass;

        const entityId = this.config?.entity;
        const sensor = entityId ? hass.states[entityId] : null;
        if (!sensor) return;

        const rawPrograms = sensor?.attributes?.programs ?? [];

        const minimal = rawPrograms.map(p => ({
            id: p.id,
            name: p.name,
            enabled: p.enabled,
            color: p.color,
            mode: p.mode,
            weekdays: p.weekdays,
            zoneCount: (p.zones || []).length,

            runtime_state: p.runtime?.state,
            runtime_start: p.runtime?.planned_start,
            planned_end: p.runtime?.planned_end
        }));

        const hash = JSON.stringify({
            view: this._view,
            selected: this._selectedProgramId,
            data: minimal
        });

        if (hash === this._lastHash) return;

        this._lastHash = hash;

        if (this._view === "detail") {
            this.renderDetail();
        } else {
            this.renderList();
            this.update(rawPrograms);
        }
        // requestAnimationFrame(() => this._lockWidth());
    }

    render() {
        if (this._view === "detail") {
            this.renderDetail();
            return;
        }

        this.renderList();
        // requestAnimationFrame(() => this._lockWidth());
    }

    _row(label, value) {
        return `
            <div class="detail-row">
            <div class="label">${label}</div>
            <div class="value">${value}</div>
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

    _getAdminTooltip(mode) {
        if (mode === "edit") return "Programm bearbeiten";
        if (mode === "delete") return "Programm löschen";

        return "";
    }

    _getActionTooltip(program) {
        const state = program.runtime?.state;

        if (state === "running") return "Programm stoppen";
        if (state === "queued" || state === "skipped") return "Jetzt starten";
   
        if (!program.enabled) return "Programm starten";

        return "";
    }

    _renderProgramAction(program) {
        const state = program.runtime?.state;

        if (state === "running") {
            return `<ha-icon icon="mdi:stop-circle-outline"></ha-icon>`;
        }

        if (state === "queued") {
            return `<ha-icon icon="mdi:play-circle-outline"></ha-icon>`;
        }

        if (state === "skipped") {
            return `<ha-icon icon="mdi:skip-forward"></ha-icon>`;
        }

        if (!program.enabled) {
            return `<ha-icon icon="mdi:play-circle"></ha-icon>`;
        }

        return `<ha-icon icon="mdi:play-circle-outline"></ha-icon>`;
    }

    renderProgramZoneRow(zoneEntry, index, allZones) {

        // 🔥 Alle anderen bereits vergebenen Zonen (ohne eigene Zeile)
        const usedByOthers = new Set(
            this._workingProgram.zones
                .filter((z, idx) => idx !== index)
                .map(z => z.zone_id)
                .filter(id => id != null)
        );

        // 🔥 Alphabetisch sortieren nach Name
        const sortedZones = [...allZones].sort((a, b) =>
            a.zone_name.localeCompare(b.zone_name, "de", { sensitivity: "base" })
        );

        // 🔥 Nur erlaubte Zonen anzeigen
        const availableZones = allZones
            .filter(z => !usedByOthers.has(z.id))
            .sort((a, b) =>
                a.zone_name.localeCompare(
                    b.zone_name,
                    "de",
                    { sensitivity: "base" }
                )
            );

        const durationMin = Math.round(zoneEntry.duration / 60);

        return `
        <div class="zone-card" data-index="${index}">

            <div class="zone-handle">
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
            </div>

            <select class="zone-select" data-index="${index}">
                ${availableZones.map(z => `
                    <option value="${z.id}"
                        ${z.id === zoneEntry.zone_id ? "selected" : ""}>
                        ${z.zone_name}
                    </option>
                `).join("")}
            </select>

            <input type="range"
                class="zone-slider"
                min="1"
                max="120"
                step="1"
                value="${durationMin}"
                data-index="${index}">

            <div class="zone-duration-label">
                ${durationMin} min
            </div>

            <ha-icon icon="mdi:trash-can-outline"
                    class="zone-delete"
                    data-index="${index}"></ha-icon>

        </div>
        `;
    }

    getAllSystemZones() {
        return Object.values(this._hass.states)
            .filter(e => {

                const prefix = this.config?.zones_prefix;
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

    renderProgramZones(program) {

        const allZones = this.getAllSystemZones();

        let html = program.zones
            .map((z, i) => this.renderProgramZoneRow(z, i, allZones))
            .join("");

        if (program.zones.length < allZones.length) {
            html += `
            <div class="zone-add-row">
                + Zone hinzufügen
            </div>
            `;
        }

        return `<div class="zone-container">${html}</div>`;
    }

    renderDetail() {
        const entityId = this.config?.entity;
        const sensor = entityId ? this._hass.states[entityId] : null;
        if (!sensor) return

        let program;

        if (this._isNewProgram) {
            program = this._workingProgram;
        } else {
            const programs = sensor.attributes.programs || [];
            program = programs.find(p => p.id === this._selectedProgramId);
            if (!program) return;

            if (!this._workingProgram || this._workingProgram.id !== program.id) {
                this._workingProgram = JSON.parse(JSON.stringify(program));
            }
        }
        // 🔥 nur beim ersten Öffnen kopieren
        if (!this._workingProgram || this._workingProgram.id !== program.id) {
        this._workingProgram = JSON.parse(JSON.stringify(program));
        }

        if (!this._workingProgram) return;
        if (!this._workingProgram.policy) {
            this._workingProgram.policy = "strict";
        }

        const title = this._workingProgram.name;


        this.innerHTML = `
        <ha-card>
            ${this.styles()}

            <div class="card-header">

            <div class="back-btn" id="backBtn">
                <ha-icon icon="mdi:arrow-left"></ha-icon>
            </div>

            <div class="title-row">
                <label class="color-inline">
                <input type="color"
                        id="colorInput"
                        value="${this._workingProgram.color}">
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
            ${this._validationErrors.zones ? `
                <div class="validation-error">
                    ${this._validationErrors.zones}
                </div>
            ` : ""}            
            </div>

        </ha-card>
        `;

        this._attachDetailEvents();
        this._attachDragAndDrop();
    }

    renderList() {
        const admin = isAdmin(this._hass);
        const entityId = this.config?.entity;
        const sensor = entityId ? this._hass.states[entityId] : null;

        const friendly = sensor?.attributes?.friendly_name;
        const titleBase =
            this.config?.title ||
            friendly ||
            "Programme";

        const title = this._isDev
            ? `${titleBase} (DEV)`
            : titleBase;

        this.innerHTML = `
            <ha-card>
            ${this.styles()}

            <div class="card-header">
                <div class="title">${title}</div>

                ${admin ? `
                    <div class="add-btn" id="addProgramBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                `: ""}     
            </div>

            <div class="programs"></div>
            </ha-card>
        `;

        this._container = this.querySelector(".programs");

        const addBtn = this.querySelector("#addProgramBtn");
        if (addBtn) {
            addBtn.addEventListener("click", () => {

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

                this._view = "detail";
                this._selectedProgramId = null;
                this._lastHash = null;
                this.hass = this._hass;
            });
        }
    }

    renderRow(program) {
        const admin = isAdmin(this._hass);
        const color = program.color || "#9e9e9e";
        const disabledClass = program.enabled ? "" : "disabled";

        // ---------- MODE ICON ----------
        const modeIcon =
            program.mode === "finish_at"
                ? "mdi:flag-checkered"
                : "mdi:play-circle-outline";

        // ---------- SCHEDULE ----------
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
                offset === 0
                    ? ""
                    : offset > 0
                        ? `+${offset}m`
                        : `${offset}m`;
        }

        // ---------- WEATHER ----------
        const weatherEnabled = program.weather?.enabled === true;

        // ---------- WEEKDAYS (SORTIERT) ----------
        const weekdayOrder = ["mon","tue","wed","thu","fri","sat","sun"];

        const labels = {
            mon: "Mo",
            tue: "Di",
            wed: "Mi",
            thu: "Do",
            fri: "Fr",
            sat: "Sa",
            sun: "So"
        };

        const weekdayText = (program.weekdays || [])
            .sort((a, b) =>
                weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b)
            )
            .map(d => labels[d])
            .join(" ");

        return `
            <div class="program-row ${disabledClass}" data-id="${program.id}">

                <div class="program-left">
                    <div class="color-dot" style="background:${color}"></div>
                </div>

                ${admin ? `
                <div class="program-admin">
                    <div class="program-delete" data-id="${program.id}" title="${this._getAdminTooltip('delete')}">
                        <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                    </div>
                    <div class="program-edit" data-id="${program.id}" title="${this._getAdminTooltip('edit')}">
                        <ha-icon icon="mdi:cog-outline"></ha-icon>
                    </div>
                </div>                
                `: ""}

                <div class="program-center">

                    <div class="program-name">
                        ${program.name}
                        <span class="program-next">
                          ${this._formatNextRun(program)}
                        </span>
                    </div>

                    <div class="program-meta">

                        <!-- Mode -->
                        <ha-icon icon="${modeIcon}"></ha-icon>

                        <!-- Schedule -->
                        <ha-icon icon="${scheduleIcon}"></ha-icon>
                        <span>${scheduleText}</span>

                        ${weatherEnabled ? `
                            <span class="separator">•</span>
                            <ha-icon 
                                icon="mdi:weather-rainy"
                                class="weather-active">
                            </ha-icon>
                        ` : ""}

                        ${weekdayText ? `
                            <span class="separator">•</span>
                            <ha-icon icon="mdi:calendar"></ha-icon>
                            <span>${weekdayText}</span>
                        ` : ""}

                    </div>

                </div>                
                <div class="program-action ${program.runtime?.state === "running" ? "running" : ""}" 
                    data-id="${program.id}"
                    data-state="${program.runtime?.state || "idle"}"
                    data-run="${program.runtime?.program_run_id || ""}"
                    title="${this._getActionTooltip(program)}">

                    ${this._renderProgramAction(program)}

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

    update(programs) {
        if (!this._container) return;

        this._container.innerHTML = programs
            .map(p => this.renderRow(p))
            .join("");

        this.attachEvents();
    }

    attachEvents() {

        this.querySelectorAll(".program-edit").forEach(el => {
            el.addEventListener("click", e => {
                const id = Number(e.currentTarget.dataset.id);

                this._selectedProgramId = id;
                this._view = "detail";

                this._lastHash = null;
                this.hass = this._hass;
            });
        });

        // -------------------------------
        // PROGRAM ACTION (tap / hold)
        // -------------------------------

        this.querySelectorAll(".program-action").forEach(el => {

            let pressStart = 0;
            let pressTimer = null;
            let isLongPress = false;

            const icon = el.querySelector("ha-icon");

            const LONG_PRESS = 600;

            el.addEventListener("pointerdown", () => {

                pressStart = Date.now();
                isLongPress = false;

                pressTimer = setTimeout(() => {

                    isLongPress = true;

                    // Icon ändern
                    icon.setAttribute("icon", "mdi:skip-forward");

                    // haptisches Feedback
                    navigator.vibrate?.(30);

                }, LONG_PRESS);

            });

            el.addEventListener("pointerup", () => {

                clearTimeout(pressTimer);

                const state = el.dataset.state;
                const id = Number(el.dataset.id);
                const runId = el.dataset.run;

                // LONG PRESS → SKIP
                if (isLongPress) {

                    if (state === "queued") {

                        callServiceWithRequest(
                            this,
                            "sprinkler_ui_program_skip",
                            { program_id: id }
                        );
                    }

                    return;
                }

                // SHORT PRESS

                if (state !== "running") {

                    callServiceWithRequest(
                        this,
                        "sprinkler_ui_program_start",
                        { program_id: id }
                    );

                    return;
                }

                if (!runId) return;

                this._openStopDialog(runId);

            });

            el.addEventListener("pointerleave", () => {
                if (!isLongPress) {
                    icon.setAttribute("icon","mdi:play-circle-outline");
                }
                clearTimeout(pressTimer);
            });

        });

    }
    
    getCardSize() {
        return 4;
    }

    _openDeleteDialog(programId) {

        const entityId = this.config?.entity;
        const sensor = entityId ? this._hass.states[entityId] : null;
        const programs = sensor?.attributes?.programs || [];
        const program = programs.find(p => p.id === programId);

        const name = program?.name || `#${programId}`;

        const dialog = document.createElement("ha-dialog");
        document.body.appendChild(dialog);

        dialog.innerHTML = `
            <style>

            .dialog-content {
                padding: 0;
                min-width: 260px;
            }

            ha-dialog {
                --mdc-dialog-shape-radius: 12px;
            }

            .dialog-header {
                background: var(--primary-color);
                color: white;
                padding: 14px 20px;
                font-size: 17px;
                font-weight: 600;
            }

            .dialog-body {
                padding: 18px 20px 8px 20px;
                text-align: center;
                font-size: 15px;
            }

            .program-name {
                font-weight: 600;
                margin-top: 6px;
            }

            .actions {
                display: flex;
                padding: 12px 20px 16px 20px;
                gap: 12px;
            }

            .action-btn {
                flex: 1;
                padding: 10px 0;
                text-align: center;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 600;
                border: 1px solid var(--divider-color);
            }

            .cancel-btn {
                background: var(--card-background-color);
            }

            .danger-btn {
                background: #e53935;
                color: white;
                border: none;
            }

            .action-btn:active {
                opacity: 0.85;
            }

            </style>

            <div class="dialog-content">

            <div class="dialog-header">
                Programm löschen
            </div>

            <div class="dialog-body">
                Wirklich löschen?
                <div class="program-name">
                ${name}
                </div>
            </div>

            <div class="actions">

                <div id="cancelBtn" class="action-btn cancel-btn">
                Abbrechen
                </div>

                <div id="confirmBtn" class="action-btn danger-btn">
                Löschen
                </div>

            </div>

            </div>
        `;

        this._activeDialog = dialog;

        setTimeout(() => dialog.show(), 0);

        dialog.querySelector("#cancelBtn").addEventListener("click", () => {
            dialog.open = false;
        });

        dialog.querySelector("#confirmBtn").addEventListener("click", () => {

            callServiceWithRequest(
            this,
            "sprinkler_ui_program_delete",
            { program_id: programId },
            { closeDialog: false }   // wir schließen manuell
            );

            dialog.close();
        });

        dialog.addEventListener("closed", () => {
            dialog.remove();
            this._activeDialog = null;
        });
    }

    _openStopDialog(runId) {

        const dialog = document.createElement("ha-dialog");
        this._closeActiveDialog();
        this._activeDialog = dialog;
        document.body.appendChild(dialog);

        dialog.innerHTML = `
            <div style="padding:20px;min-width:260px;text-align:center">

                <h3>Programm stoppen?</h3>

                <div style="margin-top:18px;display:flex;gap:10px">

                    <button id="cancelBtn"
                        style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--divider-color)">
                        Abbrechen
                    </button>

                    <button id="stopBtn"
                        style="flex:1;padding:10px;border-radius:10px;background:#e53935;color:white;border:none">
                        Stop
                    </button>

                </div>
            </div>
        `;

        this._activeDialog = dialog;

        setTimeout(() => { dialog.open = true; }, 0);

        dialog.querySelector("#cancelBtn").onclick = () => dialog.close();

        dialog.querySelector("#stopBtn").onclick = () => {

            callServiceWithRequest(
                this,
                "sprinkler_ui_program_stop",
                { program_run_id: runId },
                { closeDialog: false }
            );

            dialog.open = false;
        };

        dialog.addEventListener("closed", () => {
            dialog.remove();
            this._activeDialog = null;
        });
    }
}

// ---------- Register custom element ----------
const isDev = import.meta.env?.DEV;

const tagName = isDev
  ? "sprinklerv2-programs-card-dev"
  : "sprinklerv2-programs-card";

class SprinklerProgramsCard extends SprinklerProgramsCardBase {}

if (!customElements.get(tagName)) {
  customElements.define(
    tagName, SprinklerProgramsCard
  );
}