
import { registerSprinklerFeedback } from "./sprinklerv2-events.js";
import { callServiceWithRequest } from "./sprinklerv2-events.js";
import { isAdmin } from "./sprinklerv2-utils.js";
import { openConfirmDialog } from "./sprinklerv2-utils.js";


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

class SprinklerZonesCardBase extends HTMLElement {
  constructor() {
    super();
    this._connected = false;
    this._showDisabled = false;
    this._pendingRequestId = null;
    this._activeDialog = null;
    this._zonePrefix = null;
    this._isDev = import.meta.env?.DEV === true;
    this._view = "list";
    this._workingZone = null;
    this._selectedZone = null;
    this._isNewZone = false;
  }

  _getZonePrefix() {
    if (!this.config?.entity) return null;

    // sensor.sprinkler_zone_v2_01
    const entity = this.config.entity;

    // entfernt _XX am Ende
    return entity.replace(/_\d+$/, "");
  }

  _getZoneEntity(zoneId) {
    const prefix = this._getZonePrefix();
    if (!prefix) return null;

    return `${prefix}_${String(zoneId).padStart(2,"0")}`;
  }

  _attachEditEvents() {

    const z = this._workingZone;

    // BACK
    this.querySelector("#backBtn")?.addEventListener("click", () => {
      this._view = "list";
      this._workingZone = null;
      this.render();
    });

    // SLIDER LIVE UPDATE
    ["durationInput","loadInput","factorInput","precipInput", "rainInput"].forEach(id => {
      const el = this.querySelector(`#${id}`);
      const val = this.querySelector(`#${id}_val`);

      el?.addEventListener("input", e => {
        val.innerText = e.target.value;
      });
    });

    const typeSelect = this.querySelector("#typeInput");

    typeSelect?.addEventListener("change", e => {
      const type = e.target.value;
      console.log(type);
      const defaults = ZONE_TYPE_DEFAULTS[type];
      if (!defaults) return;

      console.log(type);
      // 👉 working copy updaten
      this._workingZone.type = type;
      this._workingZone.eto_factor = defaults.eto_factor;
      this._workingZone.rain_factor = defaults.rain_factor;

      // 👉 UI aktualisieren (falls sichtbar gemacht)
      const etoInput = this.querySelector("#factorInput");
      if (etoInput) {
        etoInput.value = defaults.eto_factor;
        this.querySelector("#factorInput_val").innerText =
          defaults.eto_factor.toFixed(1);
      }

      const rainInput = this.querySelector("#rainInput");
      if (rainInput) {
        rainInput.value = defaults.rain_factor;
        this.querySelector("#rainInput_val").innerText =
          defaults.rain_factor.toFixed(1);
      }
    });          // rain_factor optional (wenn UI vorhanden)
    // 👉 SAVE SEPARAT!
    this.querySelector("#saveBtn")?.addEventListener("click", () => {

      z.name = this.querySelector("#zoneNameInput").value;
      z.switch = this.querySelector("#switchInput").value;

      z.default_duration =
        Number(this.querySelector("#durationInput").value) * 60;

      z.load = Number(this.querySelector("#loadInput_val").innerText);
      z.eto_factor = Number(this.querySelector("#factorInput").value);
      z.rain_factor = Number(this.querySelector("#rainInput").value);
      z.precipitation_rate_mm_per_hour =
        Number(this.querySelector("#precipInput").value);

      z.enabled = this.querySelector("#enabledInput").checked;

      const service = this._isNewZone
        ? "sprinkler_ui_zone_add"
        : "sprinkler_ui_zone_update";

      callServiceWithRequest(this, service, { zone: z });

      this._view = "list";
      this._workingZone = null;
      this.render();
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
        z.name = val;

        display.innerText = val;
        input.style.display = "none";
        display.style.display = "inline-block";
      };

      input.addEventListener("keydown", e => {
        if (e.key === "Enter") finish();
      });

      input.addEventListener("blur", finish);
    }

    // LOAD STEPPER
    const loadVal = this.querySelector("#loadInput_val");

    this.querySelector("#loadInput_minus")?.addEventListener("click", () => {
      let v = Number(loadVal.innerText);
      if (v > 1) {
        v--;
        loadVal.innerText = v;
      }
    });

    this.querySelector("#loadInput_plus")?.addEventListener("click", () => {
      let v = Number(loadVal.innerText);
      const max = Number(
        this._hass.states["input_number.sprinkler_capacity"]?.state
      ) || 1;

      if (v < max) {
        v++;
        loadVal.innerText = v;
      }
    });
  }

  setConfig(config) {
    this.config = config;
  }


  set hass(hass) {
    this._hass = hass;

    /*
    requestAnimationFrame(() => {
      const w = this.getBoundingClientRect().width;
      this.style.width = `${w}px`;
    });
    */
    requestAnimationFrame(() => {
      const card = this.querySelector("ha-card");
      const w = card.getBoundingClientRect().width;
      card.style.maxWidth = `${w}px`;
    });

    if (!this._initialized) {
        this.render();
        this._initialized = true;
    }

    if (!this._feedbackRegistered && hass) {
      registerSprinklerFeedback(hass);
//      this._feedbackRegistered = true;
    }

    if (!this._zonePrefix) {
      this._zonePrefix = this._getZonePrefix();
    }
    this.update();
  }

  connectedCallback() {
    if (this._connected) return;

    /*
    requestAnimationFrame(() => {
      const w = this.getBoundingClientRect().width;
      this.style.width = `${w}px`;
    });
    */
    requestAnimationFrame(() => {
      const card = this.querySelector("ha-card");
      const w = card.getBoundingClientRect().width;
      card.style.maxWidth = `${w}px`;
    });

    this._connected = true;

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
    console.log("HA version:", this._hass.config.version);
  }

  _closeActiveDialog() {
    if (!this._activeDialog) return;

    this._activeDialog.open = false;

    setTimeout(() => {
      this._activeDialog?.remove();
      this._activeDialog = null;
    }, 150);
  }

  getCardSize() {
    return 6;
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

    const defaultSeconds =
      zoneState.attributes?.default_duration || 600;

    const remainingEntityId = `${entityId}_remaining`;
    const remainingState = this._hass.states[remainingEntityId];

    const remainingSeconds =
      Number(remainingState?.state) || defaultSeconds;

    // setTimeout(() => dialog.show(), 0);

    let minutes = Math.max(
      1,
      Math.floor(
        state === "running"
          ? remainingSeconds / 60
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
          display: flex;
          align-items: center;
          gap: 10px;
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

  openDeleteDialog(zoneId) {
    this._closeActiveDialog();
    const dialog = document.createElement("ha-dialog");
    this.appendChild(dialog);
    setTimeout(() => { dialog.open = true; }, 0);

    dialog.innerHTML = `
      <style>

        .dialog-content {
          padding: 0;
          min-width: 240px;
        }
        ha-dialog {
          --mdc-dialog-shape-radius: 10px;
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
          text-align: center;
          font-size: 15px;
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
          Zone löschen
        </div>

        <div class="dialog-body">
          Zone wirklich löschen?
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

   // setTimeout(() => dialog.show(), 0);

    dialog.querySelector("#cancelBtn").addEventListener("click", () => {
      dialog.open = false;
    });

    dialog.querySelector("#confirmBtn").addEventListener("click", () => {
      this._activeDialog = dialog;
      callServiceWithRequest(this, "sprinkler_ui_zone_delete", {zone_id: zoneId });
    });

    dialog.addEventListener("transitionend", () => {
      if (!dialog.open) dialog.remove();
    });
  }

  openCancelDialog(zoneId, qeId) {
    const dialog = document.createElement("ha-dialog");
    this.appendChild(dialog);
    setTimeout(() => { dialog.open = true; }, 0);

    dialog.innerHTML = `
      <style>

        .dialog-content {
          padding: 0;
          min-width: 240px;
        }
        ha-dialog {
          --mdc-dialog-shape-radius: 10px;
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
          text-align: center;
          font-size: 15px;
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
          Zone abbrechen
        </div>

        <div class="dialog-body">
          Möchtest du diese Zone wirklich stoppen?
        </div>

        <div class="actions">
          <div id="cancelBtn" class="action-btn cancel-btn">
            Abbrechen
          </div>

          <div id="confirmBtn" class="action-btn danger-btn">
            Stoppen
          </div>
        </div>
      </div>
    `;

    setTimeout(() => dialog.show(), 0);

    dialog.querySelector("#cancelBtn").addEventListener("click", () => {
      dialog.open = false;
    });

    dialog.querySelector("#confirmBtn").addEventListener("click", () => {
      this._activeDialog = dialog;
      callServiceWithRequest(this, "sprinkler_ui_cancel_zone", { qe_id: qeId })
    });

    dialog.addEventListener("transitionend", () => {
      if (!dialog.open) dialog.remove();
    });
  }

  render() {
    if (this._view === "edit") {
      this.renderEditView();
      return;
    }

    this.renderListView();  
  }

  renderListView() {
    const admin = isAdmin(this._hass);

    const baseTitle =
      this.config?.title ??
      this._hass?.states[this.config?.entity]?.attributes?.title ??
      "Sprinkler Zones";

    const title = this._isDev
      ? `${baseTitle} (Dev)`
      : baseTitle;

    this.innerHTML = `
      <ha-card>
        ${this.styles()}

        <div class="card-header">
          <div class="header-left">
            ${title}
          </div>

          <div class="header-right">

            ${
              admin
                ? `
                  <div class="show-disabled">
                    <ha-switch id="toggleDisabled"></ha-switch>
                    <span>Disabled</span>
                  </div>
                `
                : ""
            }

            ${
              admin
                ? `
                  <div class="add-btn" id="addZoneBtn">
                    <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                  </div>
                `
                : ""
            }

          </div>
        </div>

        <div class="zones"></div>

      </ha-card>
    `;

    this._container = this.querySelector(".zones");

    const toggle = this.querySelector("#toggleDisabled");
    if (admin && toggle) {
      toggle.addEventListener("change", e => {
        this._showDisabled = e.target.checked;
        this.update();
      });
    }
    const addBtn = this.querySelector("#addZoneBtn");
    if (admin && addBtn) {
      addBtn.addEventListener("click", () => {
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
        this.render();
      });
    }
  }

  renderEditView() {

    console.log("workingZone:", this._workingZone);

    const z = this._workingZone;

    const capacity =
      Number(this._hass.states["input_number.sprinkler_capacity"]?.state) || 1;

    const switches = Object.values(this._hass.states)
      .filter(e => e.entity_id.startsWith("switch."))
      .sort((a,b) => a.entity_id.localeCompare(b.entity_id));

    const defaults = ZONE_TYPE_DEFAULTS[z.type] || {};
    const isModified =
      z.eto_factor !== defaults.eto_factor ||
      z.rain_factor !== defaults.rain_factor;

    const typeLabel = isModified
    ? "Typ (angepasst)"
    : "Typ";

    this.innerHTML = `
      <ha-card>
        ${this.styles()}

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
              "factorInput",
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
      </ha-card>
    `;

    this._attachEditEvents();
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

  _rowInput(label, id, value = "") {
    return `
      <div class="detail-row">
        <div class="label">${label}</div>
        <input id="${id}" value="${value || ""}">
      </div>
    `;
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

  update() {
    if (!this._hass || !this._container) return;

    const prefix = this._getZonePrefix();
    if (!prefix) return;

    const zones = Object.values(this._hass.states)
        .filter(e => e.entity_id.startsWith(prefix + "_"))
        .filter(e => e.attributes && e.attributes.zone_id !== undefined)
        .filter(e => !e.attributes.deleted)  
        .filter(e =>
          this._showDisabled || e.attributes.enabled === true
        )
        .sort((a,b) => a.entity_id.localeCompare(b.entity_id));

    this._container.innerHTML = zones.map(z => this.renderRow(z)).join("");

    this.attachEvents();
  }

  getDisplayedDuration(zoneId, zone) {
    const prefix = this._getZonePrefix();
    if (!prefix) return;

    const remainingEntity =
    
      `${prefix}_${String(zoneId).padStart(2,"0")}_remaining`;

    const remaining = this._hass.states[remainingEntity]?.state;

    if (remaining !== undefined && remaining !== null && remaining !== "") {
      return this.formatDuration(remaining);
    }

    // Fallback: Default-Dauer der Zone
    const zc = zone.attributes.zone || {};
    const defaultDuration = zc.default_duration || 0;

    return this.formatDuration(defaultDuration);
  }

  renderRow(zone) {
    const admin = isAdmin(this._hass);
    const state = zone.state;

    const attrs = zone.attributes;
    const zc = attrs.zone || {};
    

    const name =
      zc.name ||
      zone.attributes.zone_name ||
      `Zone ${zone.attributes.zone_id}`;

    const zoneId = zone.attributes.zone_id;
    const qeId = zone.attributes.qe_id;
    const enabled = zone.attributes.enabled;
    const disabledClass = enabled ? "" : "disabled";

    const icon = (state === "running" || state === "queued" || state === "enqueue")
      ? "mdi:stop-circle-outline"
      : "mdi:play-circle-outline";

    const color = enabled
      ? this.stateColor(state)
      : "#bdbdbd";

    const grey =  "#9e9e9e";

    const durationStr = this.getDisplayedDuration(zoneId, zone);
    const soil = zone.attributes.soil_mm ?? null;
    const deficit = zone.attributes.deficit_mm ?? null;

    let soilText = "";

    const deficitColor =
      deficit === 0
        ? "#43a047"
        : deficit > 5
          ?  "#fb8c00"
          : "#e53935";

    if (soil !== null && deficit !== null) {
      soilText = `
        <div class="zone-soil">
          <ha-icon icon="mdi:water"> </ha-icon>
          ${soil.toFixed(1)}
          <ha-icon icon="mdi:water-minus" style="color:${deficitColor}"></ha-icon>
          ${deficit.toFixed(1)}
        </div>
      `;
    }

    return `
      <div class="zone-row ${disabledClass}" data-zone="${zoneId}" data-qe="${qeId ?? ""}">
        
        ${admin? `
          <div class="zone-left">
            <div class="zone-delete" data-action="delete" data-zone="${zoneId}">
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </div>
            <div class="zone-edit" data-action="edit" data-zone="${zoneId}">
              <ha-icon icon="mdi:cog-outline"></ha-icon>
            </div>
            <div class="zone-soil-reset" data-zone="${zoneId}">
              <ha-icon icon="mdi:water-sync"></ha-icon>
            </div>
          </div>
        ` : ""}

        <div class="zone-center" data-action="config" data-zone="${zoneId}">
          <div class="zone_name">${name}</div>
          <div class="zone-sub">Laufzeit: ${durationStr}</div>
          ${soilText}
        </div>
        <div class="zone-action" data-action="toggle" data-zone="${zoneId}">
          <ha-icon icon="${icon}" style="color:${color};"></ha-icon>
        </div>

      </div>
    `;
  }

  formatDuration(sec) {
    sec = Number(sec) || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
  }

  stateColor(state) {
    if (state === "running") return "#e53935";
    if (state === "queued" || state === "enqueue") return "#fb8c00";
    return "#9e9e9e";
  }

  attachEvents() {
    this.querySelectorAll(".zone-center").forEach(el => {
      el.addEventListener("click", e => {
        const row = e.currentTarget.closest(".zone-row");

        const zoneId = Number(row.dataset.zone);
        const qeId   = row.dataset.qe || null;

        const entityId = this._getZoneEntity(zoneId);

        const zone = this._hass.states[entityId];
        if (!zone) return;

        const { source, zone_id } = zone.attributes;
        const state = zone.state;

        // 🔒 Teil eines Programms?
        if (source !== "manual") {
          this.openProgramInfoDialog(zoneId);
          return;
        }

        // ✅ Manuelle Zone → Dialog erlauben
        this.openDurationDialog(zoneId, state, qeId);
      });
    });

    this.querySelectorAll(".zone-delete").forEach(el => {
      el.addEventListener("click", e => {
        const zoneId = Number(e.currentTarget.dataset.zone);
        const row = e.currentTarget.closest(".zone-row");
        const entityId = this._getZoneEntity(zoneId);
        const zone = this._hass.states[entityId];

        const name =
        zone?.attributes?.zone?.name ||
        zone?.attributes?.zone_name ||
        `Zone ${zoneId}`;

        console.log("openConfirmDialog:", openConfirmDialog);
        openConfirmDialog({
        title: "Zone löschen",
        text: "Zone wirklich löschen?",
        entityName: name,
        confirmText: "Löschen",
        danger: true,
        parent: this,
        onConfirm: () => {
            callServiceWithRequest(this, "sprinkler_ui_zone_delete", {
            zone_id: zoneId
            });
        }
        });        
    //    this.openDeleteDialog(zoneId);

      });
    });
    this.querySelectorAll(".zone-edit").forEach(el => {
      el.addEventListener("click", e => {
        const zoneId = Number(e.currentTarget.dataset.zone);

        const entityId = this._getZoneEntity(zoneId);
        const zone = this._hass.states[entityId];
        if (!zone) return;

        const attrs = zone.attributes;
        const zc = attrs.zone || {};

        this._workingZone = {
          zone_id: zc.zone_id ?? zoneId,
          name: zc.name ?? "",
          switch: zc.switch ?? "",
          type: zc.type ?? "lawn",
          default_duration: Number(zc.default_duration ?? 600),
          load: Number(zc.load ?? 1),
          eto_factor: Number(zc.eto_factor ?? 1),
          rain_factor: Number(zc.rain_factor ?? 1),
          precipitation_rate_mm_per_hour:
            Number(zc.precipitation_rate_mm_per_hour ?? 10),
          enabled: zc.enabled ?? true
        };

        this._isNewZone = false;
        this._view = "edit";
        this.render();
      });
    });
    this.querySelectorAll(".zone-soil-reset").forEach(el => {
      el.addEventListener("click", e => {
        const zoneId = Number(e.currentTarget.dataset.zone);

        callServiceWithRequest(
          this,
          "sprinkler_ui_reset_soil",
          { zone_id: zoneId }
        );
      });
    });
    this.querySelectorAll(".zone-action").forEach(el => {
      el.addEventListener("click", e => {
        const row = e.currentTarget.closest(".zone-row");
        
        const zoneId = Number(row.dataset.zone);
        const qeId   = row.dataset.qe || null;

        const entityId = this._getZoneEntity(zoneId)
        const state = this._hass.states[entityId]?.state;

        if (state === "running" || state === "queued") {
          this.openCancelDialog(zoneId, qeId);
        } else {
          callServiceWithRequest(this, "sprinkler_ui_start_zone", { qe_id: qeId });
        }
      });
    });
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        ha-card {
          background: #f6f7f8;   /* sehr helles Grau */
          padding: 10px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 14px 14px 14px;
        }

        .header-left {
          font-size: 18px;
          font-weight: 600;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .show-disabled {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          opacity: 0.8;
        }

        .title {
          font-size: 18px;
          font-weight: 600;
        }

        .add-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .add-btn ha-icon {
          --mdc-icon-size: 28px;
          color: var(--primary-color);
        }

        .add-btn:hover {
          background: rgba(0,0,0,0.05);
          border-radius: 50%;
        }

        .zones {
          padding: 0;
          width: 100%;
        }

        .zone-row {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;

          padding: 8px 14px;
          margin-bottom: 8px;

          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e6e6e6;

          overflow: hidden;
        }

        .zone-row:last-child {
          margin-bottom: 0;
        }

        .zone-row.disabled {
          opacity: 0.45;
        }

        .zone-left {
          display: flex;
          gap: 6px;
          width: 96px;
        }

        .zone-delete,
        .zone-edit,
        .zone-soil-reset,
        .zone-action {
          width: 40px;
          height: 40px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 10px;
          cursor: pointer;

          flex: 0 0 auto;
        }
          
        .zone-delete ha-icon,
        .zone-edit ha-icon,
        .zone-soil-reset ha-icon,
        .zone-action ha-icon {
          --mdc-icon-size: 28px;
          color: var(--secondary-text-color);
          opacity: 1;
        }

        .zone-delete:hover,
        .zone-edit:hover,
        .zone-soil-reset:hover,
        .zone-action:hover {
          background: rgba(0,0,0,0.05);
        }

        .zone-center {
          flex: 1;
          text-align: center;
          min-width: 0;
        }

        .zone_name {
          font-size: 15px;
          font-weight: 600;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
        }

        .zone-sub {
          font-size: 13px;
          opacity: 0.7;
          margin-top: 2px;
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

        .zone-action:hover {
          background: rgba(0,0,0,0.05);
        }

        .slider-row {
          display: grid;
          grid-template-columns: 110px 1fr auto;
          align-items: center;
          gap: 10px;

          padding: 8px 6px 8px 0; /* 👈 HIER */
        }

        .slider-label {
          font-size: 13px;
          opacity: 0.6;
        }

        .slider-value {
          text-align: right;
          font-size: 13px;
          font-weight: 500;
        }

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

        .slider-inner {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 10px;
        }

        .slider-inner input[type="range"] {
          width: 100%;
        }

        .slider-value {
          min-width: 70px;
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

        .step-btn:active {
          background: rgba(0,0,0,0.08);
        }

        .step-value {
          min-width: 30px;
          text-align: center;
          font-weight: 500;
        }
      </style>
    `;
  }
}
// ---------- Register custom element ----------
const isDev = import.meta.env?.DEV;

const tagName = isDev
  ? "sprinklerv2-zones-card-dev"
  : "sprinklerv2-zones-card";

class SprinklerZonesCard extends SprinklerZonesCardBase {}

if (!customElements.get(tagName)) {
  customElements.define(
    tagName, SprinklerZonesCard
  );
}