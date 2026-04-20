import { SprinklerBaseCard } from "./sprinklerv2-base-card.js";
import { openConfirmDialog } from "./sprinklerv2-utils.js";
import { callServiceWithRequest } from "./sprinklerv2-events.js";
import { isAdmin } from "./sprinklerv2-utils.js";

const ZONE_TYPES = {
  lawn: "Rasen",
  bed_sun: "Beet (volle Sonne)",
  bed_dense: "Beet (dicht bewachsen)",
  pot_outdoor: "Topf (Regen)",
  pot_protected: "Topf (geschützt)"
};

const ZONE_TYPE_DEFAULTS = {
  lawn: { eto_factor: 1.0, rain_factor: 1.0 },
  bed_sun: { eto_factor: 0.8, rain_factor: 1.0 },
  bed_dense: { eto_factor: 0.6, rain_factor: 0.6 },
  pot_outdoor: { eto_factor: 0.5, rain_factor: 0.5 },
  pot_protected: { eto_factor: 0.5, rain_factor: 0.0 }
};

class SprinklerZonesCardV2 extends SprinklerBaseCard {

    styles() {
        return `
            <style>

            .zone-left {
                display: flex;
                gap: 6px;
            }

            .zone-soil {
                display: flex;
                justify-content: center;
                gap: 8px;
                font-size: 12px;
                opacity: 0.8;
                margin-top: 2px;
            }

            .zone-soil ha-icon {
                --mdc-icon-size: 14px;
            }

            .row.disabled {
                opacity: 0.45;
            }
            </style>
        `;
    }

    getData() {


        if (!this._hass || !this._config?.entity) return [];

        const prefix = this._config.entity.replace(/_\d+$/, "");

        return Object.values(this._hass.states)
            .filter(e => e.entity_id.startsWith(prefix + "_"))
            .filter(e => e.attributes?.zone_id !== undefined)
            .filter(e => !e.attributes.deleted)  
            .filter(e => this._showDisabled || e.attributes.enabled === true
            )
            .sort((a,b) => a.entity_id.localeCompare(b.entity_id));
    }

    _getZonePrefix() {
        if (!this._config?.entity) return null;

        // sensor.sprinkler_zone_v2_01
        const entity = this._config.entity;

        // entfernt _XX am Ende
        return entity.replace(/_\d+$/, "");
    }

    _getZoneConfig(zoneState) {
        return zoneState?.attributes?.zone || {};
    }

    formatDuration(sec) {
        sec = Number(sec) || 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
    }

    getDisplayedDuration(zone) {

        const attrs = zone.attributes;
        const zoneId = attrs.zone_id;

        const prefix = this._getZonePrefix();
        if (!prefix) return "";

        // console.log("zoneId:", zoneId, "prefix:", prefix);
        const remainingEntity =
            `${prefix}_${String(zoneId).padStart(2,"0")}_remaining`;

        const remaining = this._hass.states[remainingEntity]?.state;

        // console.log("zoneId:", zoneId, "prefix:", prefix, "Entity:", remainingEntity, "remaining:", remaining);

        // 👉 laufende / queued Zone
        if (remaining !== undefined && remaining !== null && remaining !== "") {
            return this.formatDuration(remaining);
        }

        // 👉 fallback: default
        const zc = attrs.zone || {};
        const defaultDuration = zc.default_duration || 0;

        return this.formatDuration(defaultDuration);
    }

    render(data) {

        if (this._view === "edit") {
            return this.renderEditView();   // 🔥 DAS fehlt bei dir
        }
        const admin = isAdmin(this._hass);

        const zones = Array.isArray(data) ? data : [];    

        const title =
            this._config?.title ||
            this._hass?.states[this._config.entity]?.attributes?.title ||
            "Zonen";

        return `
            <div class="card-header">

                <div class="title">${title}</div>

                <div class="header-actions">

                    ${admin ? `<div class="show-disabled">
                        <ha-switch id="toggleDisabled" ${this._showDisabled ? "checked" : ""}></ha-switch>
                        <span>Disabled</span>
                    </div>
                    `: ""}

                    ${admin ? `<div class="add-btn" id="addZoneBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                    `: ""}
                </div>

            </div>

            <div class="zones">
                ${zones.map(z => this.renderRow(z)).join("")}
            </div>
        `;
    }

    renderRow(zone) {
        const state = zone.state;
        const attrs = zone.attributes;
        const admin = isAdmin(this._hass);

        const zc = this._getZoneConfig(zone);

        const zoneId = attrs.zone_id;
        const enabled = attrs.enabled;

        const name =
            zc.name ||
            attrs.zone_name ||
            `Zone ${zoneId}`;

        const disabledClass = enabled ? "" : "disabled";
        
        const icon =
            (state === "running" || state === "queued" || state === "enqueue")
            ? "mdi:stop-circle-outline"
            : "mdi:play-circle-outline";

        const color =
            state === "running"
            ? "#e53935"
            : state === "queued"
                ? "#fb8c00"
                : "#9e9e9e";

        const duration = this.getDisplayedDuration(zone);
        
        // ---- Soil ----
        const soil = attrs.soil_mm ?? null;
        const deficit = attrs.deficit_mm ?? null;

        let soilText = "";

        if (soil !== null && deficit !== null) {

            const deficitColor =
            deficit === 0
                ? "#43a047"
                : deficit > 5
                ? "#fb8c00"
                : "#e53935";

            soilText = `
            <div class="zone-soil">
                <ha-icon icon="mdi:water"></ha-icon>
                ${soil.toFixed(1)}

                <ha-icon icon="mdi:water-minus" style="color:${deficitColor}"></ha-icon>
                ${deficit.toFixed(1)}
            </div>
            `;
        }

        return `
            <div class="row ${disabledClass}" data-zone="${zoneId}">

            <!-- LEFT -->
            <div class="zone-left">
                ${admin ? `
                <div class="icon-btn zone-delete" data-zone="${zoneId}">
                <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                </div>
                ` : ""}
                ${admin ? `
                <div class="icon-btn zone-edit" data-zone="${zoneId}">
                <ha-icon icon="mdi:cog-outline"></ha-icon>
                </div>
                ` : ""}
                ${admin ? `
                <div class="icon-btn zone-reset" data-zone="${zoneId}">
                <ha-icon icon="mdi:water-sync"></ha-icon>
                </div>
                `: ""}
            </div>

            <!-- CENTER -->
            <div class="center">
                <div class="name">${name}</div>
                <div class="sub">Laufzeit: ${duration}</div>
                ${soilText}
            </div>

            <!-- RIGHT -->
            <div class="icon-btn zone-action" data-zone="${zoneId}">
                <ha-icon icon="${icon}" style="color:${color}"></ha-icon>
            </div>

            </div>
        `;
        this.attachEvents();
    }

    attachEvents() {
        // ---- Action Start, Cancel ----
        this.querySelectorAll(".zone-action").forEach(el => {

            el.addEventListener("click", (e) => {

            const row = e.currentTarget.closest(".row");
            const zoneId = Number(row.dataset.zone);

            this._handleZoneAction(zoneId);

            });

        });
        // ---- CENTER, Duration ----
        this.querySelectorAll(".center").forEach(el => {

            el.addEventListener("click", (e) => {

                const row = e.currentTarget.closest(".row");

                const zoneId = Number(row.dataset.zone);

                this._handleZoneCenterClick(zoneId);

            });

        });
        // ---- DELETE ----
        this.querySelectorAll(".zone-delete").forEach(el => {
            el.addEventListener("click", (e) => {
            const zoneId = Number(e.currentTarget.dataset.zone);
            this._handleDelete(zoneId);
            });
        });

        // ---- RESET ----
        this.querySelectorAll(".zone-reset").forEach(el => {
            el.addEventListener("click", (e) => {
            const zoneId = Number(e.currentTarget.dataset.zone);
            this._handleReset(zoneId);
            });
        });

        // ---- EDIT ----
        this.querySelectorAll(".zone-edit").forEach(el => {
            el.addEventListener("click", (e) => {
            const zoneId = Number(e.currentTarget.dataset.zone);
            this._handleEdit(zoneId);
            });
        });

        // Disabled toggle
        this.querySelector("#toggleDisabled")?.addEventListener("change", (e) => {
            this._showDisabled = e.target.checked;
            this._renderInternal(this.getData());
        });

        // ADD
        this.querySelector("#addZoneBtn")?.addEventListener("click", () => {
            this._workingZone = {
                name: "",
                switch: "",
                type: "lawn",
                default_duration: 600,
                load: 1,
                eto_factor: 1,
                rain_factor: 1,
                precipitation_rate_mm_per_hour: 10,
                enabled: true
            };

            this._isNewZone = true;
            this._view = "edit";

            this._renderInternal(this.getData());
        });
    }

    _rowSelect(label, id, options, selected) {
        return `
        <div class="detail-row">
            <div class="label">${label}</div>
            <select id="${id}">
            ${options.map(o => `
                <option value="${o.value}"
                ${o.value === selected ? "selected" : ""}>
                ${o.label}
                </option>
            `).join("")}
            </select>
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

    _rowSliderCompact(label, id, value, min, max, unit = "", step = 1) {
        return `
        <div class="slider-row">

            <div class="label">${label}</div>

            <input type="range"
            id="${id}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}">

            <div class="slider-value">
            <span id="${id}_val">${value}</span> ${unit}
            </div>

        </div>
        `;
    }

    _rowStepper(label, id, value, min, max) {
        return `
        <div class="detail-row stepper-row">

            <div class="label">${label}</div>

            <div class="stepper">
            <div class="step-btn" id="${id}_minus">−</div>
            <div class="step-value" id="${id}_val">${value}</div>
            <div class="step-btn" id="${id}_plus">+</div>
            </div>

        </div>
        `;
    }
    
    renderEditView() {

        const z = this._workingZone;
        if (!z) return `<div>No zone</div>`;

        const switches = Object.values(this._hass.states)
            .filter(e => e.entity_id.startsWith("switch."))
            .sort((a,b) => a.entity_id.localeCompare(b.entity_id));

        const capacity = Number(this._hass.states["input_number.sprinkler_capacity"]?.state) || 1;

        const defaults = ZONE_TYPE_DEFAULTS[z.type] || {};

        const isModified =
            z.eto_factor !== defaults.eto_factor ||
            z.rain_factor !== defaults.rain_factor;

        const typeLabel = isModified
            ? "Typ (angepasst)"
            : "Typ";

        return `
            <div class="edit">

            <div class="card-header">

                <div class="back-btn" id="backBtn">
                <ha-icon icon="mdi:arrow-left"></ha-icon>
                </div>

                <div class="title-inline-wrapper">
                <span id="zoneNameDisplay" class="title-inline-display">
                    ${z.name || "Neue Zone"}
                </span>

                <input id="zoneNameInput"
                    class="title-inline-input"
                    type="text"
                    value="${z.name || ""}"
                    style="display:none;" />
                </div>

                <div class="save-btn" id="saveBtn">
                <ha-icon icon="mdi:content-save-outline"></ha-icon>
                </div>

            </div>

            <div class="detail-content">
                <div class="detail-block">

                ${this._rowToggle("Aktiviert", "enabledInput", z.enabled)}

                ${this._rowSelect(
                    "Switch",
                    "switchInput",
                    switches.map(sw => ({
                    value: sw.entity_id,
                    label: sw.entity_id
                    })),
                    z.switch
                )}

                ${this._rowSelect(
                    typeLabel,
                    "typeInput",
                    Object.entries(ZONE_TYPES).map(([value, label]) => ({
                    value,
                    label
                    })),
                    z.type || "lawn"
                )}

                <div class="divider"></div>

                ${this._rowSliderCompact(
                    "Laufzeit",
                    "durationInput",
                    Math.floor((z.default_duration || 600) / 60),
                    1,
                    240,
                    "min"
                )}

                ${this._rowSliderCompact(
                    "Precipitation",
                    "precipInput",
                    z.precipitation_rate_mm_per_hour || 10,
                    1,
                    30,
                    "mm/h"
                )}

                <div class="divider"></div>

                ${this._rowStepper(
                    "Load",
                    "loadInput",
                    z.load || 1,
                    1,
                    capacity
                )}

                ${this._rowSliderCompact(
                    "ETo Factor",
                    "etoInput",
                    z.eto_factor ?? 1,
                    0.1,
                    2.0,
                    "",
                    0.1
                )}

                ${this._rowSliderCompact(
                    "Rain Factor",
                    "rainInput",
                    z.rain_factor ?? 1,
                    0,
                    1,
                    "",
                    0.1
                )}

                </div>
            </div>

            </div>
        `;
    }

    _attachEditEvents() {
        const z = this._workingZone;

        // BACK
        this.querySelector("#backBtn")?.addEventListener("click", () => {
            this._view = "list";
            this._workingZone = null;
            this._renderInternal(this.getData());
        });

        // SAVE
        this.querySelector("#saveBtn")?.addEventListener("click", () => {

            z.name = this.querySelector("#zoneNameInput").value;
            z.switch = this.querySelector("#switchInput").value;

            z.default_duration =
            Number(this.querySelector("#durationInput").value) * 60;

            z.precipitation_rate_mm_per_hour =
            Number(this.querySelector("#precipInput").value);

            z.eto_factor =
            Number(this.querySelector("#etoInput").value);

            z.rain_factor =
            Number(this.querySelector("#rainInput").value);

            z.enabled =
            this.querySelector("#enabledInput").checked;

            const service = this._isNewZone
                ? "sprinkler_ui_zone_add"
                : "sprinkler_ui_zone_update";

            callServiceWithRequest(this, service, { zone: z });

            this._isNewZone = false;
            this._view = "list";
            this._workingZone = null;

            this._renderInternal(this.getData());
        });

        const display = this.querySelector("#zoneNameDisplay");
        const input = this.querySelector("#zoneNameInput");

        if (display && input) {

            display.addEventListener("click", () => {
                display.style.display = "none";
                input.style.display = "inline-block";
                input.focus();
                input.select();
            });

            const finish = () => {
                const val = input.value.trim() || "Neue Zone";
                this._workingZone.name = val;

                display.innerText = val;
                input.style.display = "none";
                display.style.display = "inline-block";
            };

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") finish();
            });

            input.addEventListener("blur", finish);
        }

        ["durationInput","precipInput","factorInput","rainInput"].forEach(id => {
            const el = this.querySelector(`#${id}`);
            const val = this.querySelector(`#${id}_val`);

            el?.addEventListener("input", e => {
                if (val) val.innerText = e.target.value;
            });
        });

        const loadVal = this.querySelector("#loadInput_val");

        this.querySelector("#loadInput_minus")?.addEventListener("click", () => {
            let v = Number(loadVal.innerText);
            if (v > 1) loadVal.innerText = v - 1;
        });

        this.querySelector("#loadInput_plus")?.addEventListener("click", () => {
            let v = Number(loadVal.innerText);
            const capacity = Number(this._hass.states["input_number.sprinkler_capacity"]?.state) || 1;

            if (v < capacity) loadVal.innerText = v + 1;
        });
    }

    _getZoneEntity(zoneId) {
        const prefix = this._getZonePrefix();
        if (!prefix) return null;

        return `${prefix}_${String(zoneId).padStart(2,"0")}`;
    }

    _handleZoneAction(zoneId) {

        const entityId = this._getZoneEntity(zoneId);
        if (!entityId) return;

        const zone = this._hass.states[entityId];
        if (!zone) return;

        const state = zone.state;
        const qeId = zone.attributes.qe_id;

        // -------------------------
        // STOP
        // -------------------------
        if (state === "running" || state === "queued") {
            callServiceWithRequest(this, "sprinkler_ui_cancel_zone", { qe_id: qeId });
            return;
        }

        // -------------------------
        // START
        // -------------------------
        callServiceWithRequest(this, "sprinkler_ui_start_zone", { qe_id: qeId });
    }

    _handleZoneCenterClick(zoneId) {

        const entityId = this._getZoneEntity(zoneId);
        if (!entityId) return;

        const zone = this._hass.states[entityId];
        if (!zone) return;

        const { source } = zone.attributes;
        const state = zone.state;
        const qeId = zone.attributes.qe_id;

        // 🔒 Teil eines Programms?
        if (source !== "manual") {
            this.openProgramInfoDialog?.(zoneId);
            return;
        }

        // ✅ Manuelle Zone → Duration Dialog
        this.openDurationDialog(zoneId, state, qeId);
    }

    _closeActiveDialog() {
        if (!this._activeDialog) return;

        this._activeDialog.open = false;

        setTimeout(() => {
        this._activeDialog?.remove();
        this._activeDialog = null;
        }, 150);
    }

    openDurationDialog(zoneId, state, qeId) {
        this._closeActiveDialog();
        const dialog = document.createElement("ha-dialog");
        this.appendChild(dialog);
        setTimeout(() => { dialog.open = true; }, 0);

        const entityId = this._getZoneEntity(zoneId);
        if (!entityId) return;

        const zoneState = this._hass.states[entityId];
        if (!zoneState) return;

        const zc = this._getZoneConfig(zoneState);

        const defaultSeconds =
        Number(zc.default_duration) || 600;

        const remainingEntityId = `${entityId}_remaining`;
        const remainingState = this._hass.states[remainingEntityId];

        const remainingRaw = remainingState?.state;
        const remainingSeconds = Number(remainingRaw);

        const finalSeconds =
        Number.isFinite(remainingSeconds) && remainingSeconds > 0
            ? remainingSeconds
            : defaultSeconds;
        // const remainingSeconds =
        // Number(remainingState?.state) || defaultSeconds;

        // setTimeout(() => dialog.show(), 0);

        let minutes = Math.max(
            1,
            Math.floor(
                state === "running"
                ? finalSeconds / 60
                : defaultSeconds / 60
            )
        );

        const isRunning = state === "running";
        const isQueued = state === "queued";
        const headerText = isRunning
        ? "Restlaufzeit einstellen"
        : "Laufzeit einstellen";

        const actionText = isRunning
        ? "Setzen"
        : (isQueued ? "Übernehmen" : "Start");

        dialog.innerHTML = `
        <style>
            ha-dialog {
            --mdc-dialog-shape-radius: 10px;
            }
            .dialog-content {
            padding: 0;
            min-width: 240px;
            }

            .dialog-header {
            background: var(--primary-color);
            color: white;
            padding: 14px 20px;
            font-size: 17px;
            font-weight: 600;
            }

            .dialog-body {
            padding: 18px 20px 8px 20px; /* unten weniger */
            }

            .value-display {
            text-align: center;
            font-size: 26px;
            font-weight: 600;
            margin-bottom: 8px;
            }

            .slider-row {
                display: grid;
                grid-template-columns: 110px 1fr auto;
                align-items: center;
                gap: 10px;

                padding: 8px 6px 8px 0; /* 👈 HIER */
            }

            ha-slider {
            flex: 1;
            }

            .step-btn {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            border: 1px solid var(--divider-color);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            cursor: pointer;
            background: var(--card-background-color);
            }

            .step-btn:active {
            background: rgba(0,0,0,0.08);
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

            .start-btn {
            background: var(--primary-color);
            color: white;
            border: none;
            }

            .action-btn:active {
            opacity: 0.85;
            }
        </style>

        <div class="dialog-content">
            <div class="dialog-header">
            ${headerText}
            </div>

            <div class="dialog-body">
            <div id="value" class="value-display">
                ${minutes} min
            </div>

            <div class="slider-row">
                <div id="minus" class="step-btn">−</div>

                <ha-slider
                id="slider"
                min="1"
                max="120"
                step="1"
                value="${minutes}"
                pin
                ></ha-slider>

                <div id="plus" class="step-btn">+</div>
            </div>
            </div>

            <div class="actions">
            <div id="cancelBtn" class="action-btn cancel-btn">
                Abbrechen
            </div>

            ${
                isRunning
                ? `
                    <div id="stopBtn" class="action-btn cancel-btn">
                    Stoppen
                    </div>
                    <div id="extendBtn" class="action-btn start-btn">
                    ${actionText}
                    </div>
                `
                : `
                    <div id="startBtn" class="action-btn start-btn">
                    ${actionText}
                    </div>
                `
            }
            </div>
        </div>
        `;

        // document.body.appendChild(dialog);
        // WICHTIG
        /*
        setTimeout(() => {
        //dialog.show();
        dialog.open = true;
        }, 0);
        */
        const slider = dialog.querySelector("#slider");
        const valueEl = dialog.querySelector("#value");
        const minusBtn = dialog.querySelector("#minus");
        const plusBtn  = dialog.querySelector("#plus");

        const min = Number(slider.min);
        const max = Number(slider.max);

        function updateDisplay() {
        valueEl.textContent = `${minutes} min`;
        slider.value = minutes;
        }

        let interval;

        plusBtn.addEventListener("mousedown", () => {
        interval = setInterval(() => {
            if (minutes < max) {
            minutes++;
            updateDisplay();
            }
        }, 150);
        });

        ["mouseup","mouseleave"].forEach(evt =>
        plusBtn.addEventListener(evt, () => clearInterval(interval))
        );

        minusBtn.addEventListener("mousedown", () => {
        interval = setInterval(() => {
            if (minutes > min) {
            minutes--;
            updateDisplay();
            }
        }, 150);
        });

        ["mouseup","mouseleave"].forEach(evt =>
        minusBtn.addEventListener(evt, () => clearInterval(interval))
        );

        minusBtn?.addEventListener("click", () => {
        if (minutes > min) {
            minutes--;
            updateDisplay();
        }
        });

        plusBtn?.addEventListener("click", () => {
        if (minutes < max) {
            minutes++;
            updateDisplay();
        }
        });
        slider.addEventListener("input", (e) => {
        minutes = Number(e.target.value);
        updateDisplay();
        });

        dialog.querySelector("#cancelBtn").addEventListener("click", () => {
        dialog.open = false;
        });

        if (isRunning) {
        dialog.querySelector("#stopBtn").addEventListener("click", () => {
            this._activeDialog = dialog;
            callServiceWithRequest(this, "sprinkler_ui_cancel_zone", { qe_id: qeId });
        });

        dialog.querySelector("#extendBtn").addEventListener("click", () => {
            this._activeDialog = dialog;
            callServiceWithRequest(this, "sprinkler_ui_extend_zone", { qe_id: qeId, duration: minutes * 60 });
        });
        } else {
        dialog.querySelector("#startBtn").addEventListener("click", () => {
            const service =
            isQueued
                ? "sprinkler_ui_extend_zone"
                : "sprinkler_ui_start_zone";

            this._activeDialog = dialog;
            callServiceWithRequest(this, service, { qe_id: qeId, duration: minutes * 60 });

        });
        }
        dialog.addEventListener("transitionend", () => {
        if (!dialog.open) dialog.remove();
        });
    }

    _handleDelete(zoneId) {

        const entityId = this._getZoneEntity(zoneId);
        const zone = this._hass.states[entityId];

        const name =
            zone?.attributes?.zone?.name ||
            zone?.attributes?.zone_name ||
            `Zone ${zoneId}`;

        openConfirmDialog({
            title: "Zone löschen",
            text: "Zone wirklich löschen?",
            entityName: name,
            confirmText: "Löschen",
            danger: true,
            parent: this,
            onConfirm: () => {
            callServiceWithRequest(
                this,
                "sprinkler_ui_zone_delete",
                { zone_id: zoneId }
            );
            }
        });
    }

    _handleReset(zoneId) {

        openConfirmDialog({
            title: "Bodenbilanz zurücksetzen",
            text: "Soll die Bodenfeuchte dieser Zone zurückgesetzt werden?",
            confirmText: "Zurücksetzen",
            danger: false,
            parent: this,
            onConfirm: () => {
                callServiceWithRequest(
                    this,
                    "sprinkler_ui_reset_soil",
                    { zone_id: zoneId }
                );
            }
        });

    }

    _handleEdit(zoneId) {

        const entityId = this._getZoneEntity(zoneId);
        const zone = this._hass.states[entityId];
        if (!zone) return;

        const attrs = zone.attributes;
        const zc = this._getZoneConfig(zone);

        this._workingZone = {
            zone_id: attrs.zone_id,
            name: zc.name ?? "",
            switch: zc.switch ?? "",
            type: zc.type ?? "lawn",
            default_duration: Number(zc.default_duration ?? 600),
            load: Number(zc.load ?? 1),
            eto_factor: Number(zc.eto_factor ?? 1),
            rain_factor: Number(zc.rain_factor ?? 1),
            precipitation_rate_mm_per_hour:
            Number(zc.precipitation_rate_mm_per_hour ?? 10),
            enabled: attrs.enabled ?? true
        };

        this._view = "edit";

        this._renderInternal(this.getData()); // 👈 wichtig
    }
}

customElements.define(
  "sprinklerv2-zones-card-v2",
  SprinklerZonesCardV2
);