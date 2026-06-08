import{i as e,n as t,r as n,t as r}from"./sprinklerv2-utils.js";var i=class extends n{constructor(){super(),this._view=`list`,this._selectedProgramId=null,this._workingProgram=null,this._isNewProgram=!1,this._validationErrors={},this._activeDialog=null,this._showDisabled=!1}getData(){if(!this._hass)return[];let e=this._config?.entity;return(e?this._hass.states[e]:null)?.attributes?.programs||[]}setConfig(e){if(!e.entity)throw Error(`Program entity (entity) is required`);this._config={...e,zones_prefix:e.zones_prefix??e.entity.replace(/_programs?.*$/i,`_zone`)}}styles(){return`
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
    `}render(e=[]){return this._view===`edit`?this.renderDetail(e):this.renderList(e)}_formatNextRun(e){let t=e.runtime;if(!t)return``;let n=t.state;if(n===`running`&&t.planned_end)return`· bis ${new Date(t.planned_end).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`})}`;if(n!==`queued`||!t.planned_start)return``;let r=new Date(t.planned_start),i=new Date,a=r-i;if(a<=0)return``;let o=Math.round(a/6e4),s=r.toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}),c=i.toDateString(),l=new Date(i);l.setDate(i.getDate()+1);let u=l.toDateString();return o<60?`· in ${o} min`:r.toDateString()===c?`· heute ${s}`:r.toDateString()===u?`· morgen ${s}`:`· ${r.toLocaleDateString(`de-DE`,{weekday:`short`})} ${s}`}renderList(e=[]){let t=r(this._hass),n=e;this._showDisabled||(n=e.filter(e=>e.enabled));let i=this._config?.title||this._hass.states[this._config?.entity]?.attributes?.friendly_name||`Programme`,a=this._isDev?`${i} (DEV)`:i;return this._showDisabled,`
            <div class="card-header">
                <div class="title">${a}</div>

                <div class="header-actions">

                    ${t?`<div class="show-disabled">
                        <ha-switch id="showDisabledSwitch" ${this._showDisabled?`checked`:``}></ha-switch>
                        <span>Disabled</span>
                    </div>
                    `:``}

                    ${t?`
                        <div class="add-btn" id="addProgramBtn">
                            <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                        </div>
                    `:``}

                </div>
            </div>

            <div class="programs">
                ${n.map(e=>this.renderRow(e)).join(``)}
            </div>
        `}_validateProgram(e){let t={};(!e.zones||e.zones.length===0)&&(t.zones=`Mindestens eine Zone erforderlich.`);let n=e.zones.map(e=>e.zone_id);return new Set(n).size!==n.length&&(t.zones=`Eine Zone darf nur einmal vorkommen.`),e.zones.some(e=>!e.duration||e.duration<=0)&&(t.zones=`Ungültige Laufzeit.`),(!e.weekdays||e.weekdays.length===0)&&(t.weekdays=`Mindestens ein Wochentag erforderlich.`),e.schedule?.type===`fixed`&&!e.schedule?.time&&(t.schedule=`Uhrzeit fehlt.`),t}renderProgramHeader(e){return e.schedule?.type===`fixed`?`${e.schedule.time}`:`${e.schedule?.event||``}${e.schedule?.offset_minutes||0}`,`
        <div class="detail-block">

            ${this._rowToggle(`Aktiviert`,`enabledSwitch`,e.enabled)}
            ${this._rowToggle(`Wetter`,`weatherSwitch`,e.weather?.enabled)}
            <div class="divider"></div>
            
            ${this._renderWeekdaySection(e)}
            ${this._validationErrors.weekdays?`
                <div class="validation-error">
                    ${this._validationErrors.weekdays}
                </div>
            `:``}

            ${this._renderScheduleSection(e)}
            <div class="divider"></div>
            ${this._renderModeSection(e)}
            ${this._renderRepeatSection(e)}
        </div>
        `}_rowToggle(e,t,n){return`
            <div class="detail-row toggle-row">
                <div class="label">${e}</div>
                <ha-switch id="${t}" ${n?`checked`:``}></ha-switch>
            </div>
        `}getAllSystemZones(){return Object.values(this._hass.states).filter(e=>{let t=this._config?.zones_prefix;if(!t||!e.entity_id.startsWith(t+`_`))return!1;let n=e.attributes||{};return!(n.enabled!==!0||!n.zone_name)}).map(e=>({id:Number(e.entity_id.split(`_`).pop()),zone_name:e.attributes.zone_name})).sort((e,t)=>e.id-t.id)}_renderWeekdaySection(e){let t=[`mon`,`tue`,`wed`,`thu`,`fri`,`sat`,`sun`],n={mon:`Mo`,tue:`Di`,wed:`Mi`,thu:`Do`,fri:`Fr`,sat:`Sa`,sun:`So`},r=e.weekdays||[];return`
            <div class="weekday-row">
            ${t.map(e=>`
                <div class="weekday-chip ${r.includes(e)?`active`:``}"
                    data-day="${e}">
                ${n[e]}
                </div>
            `).join(``)}
            </div>
        `}_renderColorSection(e){let t=e.color||`#4CAF50`;return`
            <div class="divider"></div>

            <div class="detail-row">
            <div class="color-picker-row">
                <div class="color-dot-large"
                    style="background:${t}"
                    id="colorPreview">
                </div>

                <span class="color-label">Farbe</span>

                <input type="color"
                    id="colorInput"
                    value="${t}"
                    style="display:none;">
            </div>
            </div>
        `}_renderModeSection(e){let t=e.mode||`start_at`;return`
            <div class="mode-radio-row">

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="start_at"
                        ${t===`start_at`?`checked`:``}>
                    Startet ab
                </label>

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="finish_at"
                        ${t===`finish_at`?`checked`:``}>
                    Fertig bis
                </label>

            </div>
        `}_renderScheduleSection(e){let t=e.schedule||{type:`fixed`,time:`06:00`},n=t.type===`fixed`,r=t.type===`sun`,i=t.event||`sunrise`,a=t.offset_minutes||0;return`
        <div class="divider"></div>

        <div class="schedule-block">

            <!-- FIX -->
            <label class="schedule-option ${n?`active`:``}">
                <input type="radio"
                    name="scheduleType"
                    value="fixed"
                    ${n?`checked`:``}>
                <span>Fixe Uhrzeit</span>

                <input type="time"
                    id="scheduleTimeInput"
                    class="time-input"
                    value="${t.time||`06:00`}"
                    ${n?``:`disabled`}>
            </label>

            <!-- SUNRISE -->
            <label class="schedule-option ${r&&i===`sunrise`?`active`:``}">
                <input type="radio"
                    name="scheduleType"
                    value="sunrise"
                    ${r&&i===`sunrise`?`checked`:``}>
                <span>Sonnenaufgang</span>
            </label>

            <!-- SUNSET -->
            <label class="schedule-option ${r&&i===`sunset`?`active`:``}">
                <input type="radio"
                    name="scheduleType"
                    value="sunset"
                    ${r&&i===`sunset`?`checked`:``}>
                <span>Sonnenuntergang</span>
            </label>

            <!-- OFFSET -->
            <div class="label">Offset</div>
            <div class="offset-row ${r?``:`disabled`}">
                <input type="range"
                    id="scheduleOffsetInput"
                    min="-120"
                    max="120"
                    step="5"
                    value="${a}">

                <div class="offset-value">
                    ${a} min
                </div>
            </div>

        </div>
        `}_renderRepeatSection(e){return`
            <div class="divider"></div>

            <div class="detail-row">
                <div class="label">Wiederholungen</div>

                <input
                    type="number"
                    id="repeatInput"
                    min="0"
                    max="10"
                    value="${e.repeat??0}"
                    style="width:70px">
            </div>

            <div class="detail-row">
                <div class="label">Pause (min)</div>

                <input
                    type="number"
                    id="pauseInput"
                    min="0"
                    max="720"
                    value="${e.pause_minutes??0}"
                    style="width:70px">

            </div>
        `}renderProgramZoneRow(e,t,n){let r=new Set(this._workingProgram.zones.filter((e,n)=>n!==t).map(e=>e.zone_id).filter(e=>e!=null)),i=n.filter(t=>t.id===e.zone_id||!r.has(t.id)).sort((e,t)=>e.zone_name.localeCompare(t.zone_name,`de`,{sensitivity:`base`})),a=Math.round((e.duration||60)/60);return`
        <div class="zone-card" data-index="${t}">

            <div class="zone-handle" draggable="true">
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
            </div>

            <select class="zone-select" data-index="${t}">
                ${i.length===0?`
                    <option value="">Keine Zone verfügbar</option>
                `:i.map(t=>`
                    <option value="${t.id}"
                        ${t.id===e.zone_id?`selected`:``}>
                        ${t.zone_name}
                    </option>
                `).join(``)}
            </select>

            <div class="slider-block zone-slider" data-index="${t}">
                <input type="range"
                    min="1"
                    max="120"
                    step="1"
                    value="${a}">
            </div>

            <div class="zone-duration-label" data-index="${t}">
                ${a} min
            </div>

            <ha-icon icon="mdi:trash-can-outline"
                    class="zone-delete"
                    data-index="${t}"></ha-icon>

        </div>
        `}renderProgramZones(e){let t=this.getAllSystemZones(),n=e.zones.map((e,n)=>this.renderProgramZoneRow(e,n,t)).join(``);return t.length>0&&e.zones.length<t.length&&(n+=`
            <div class="zone-add-row">
                <ha-icon icon="mdi:plus"></ha-icon>
                Neue Zone hinzufügen
            </div>
            `),`<div class="zone-container">${n}</div>`}renderDetail(e=[]){let t;if(this._isNewProgram)t=this._workingProgram;else{if(t=e.find(e=>e.id===this._selectedProgramId),!t)return`<div>Programm nicht gefunden</div>`;(!this._workingProgram||this._workingProgram.id!==t.id)&&(this._workingProgram=JSON.parse(JSON.stringify(t)))}return`
            <div class="card-header">

                <div class="back-btn" id="backBtn">
                    <ha-icon icon="mdi:arrow-left"></ha-icon>
                </div>

                <div class="title-row">
                    <label class="color-inline">
                        <input type="color"
                            id="colorInput"
                            value="${this._workingProgram.color||`#4CAF50`}">
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
        `}_updateRuntime(e){this._view!=`edit`&&this._renderInternal(e)}_getRenderState(e){return e.map(e=>({id:e.id,name:e.name,enabled:e.enabled,mode:e.mode,repeat:e.repeat,pause:e.pause_minutes,weekdays:(e.weekdays||[]).join(`,`),schedule:[e.schedule?.type,e.schedule?.time,e.schedule?.event,e.schedule?.offset_minutes].join(`|`),zones:(e.zones||[]).map(e=>`${e.zone_id}:${e.duration}`).join(`|`),weather:e.weather?.enabled,runtime_state:e.runtime?.state}))}renderRow(e){let t=r(this._hass),n=e.color||`#9e9e9e`,i=e.enabled?``:`disabled`,a=e.runtime?.state||`idle`,o=a===`running`,s=e.runtime||{},c=`mdi:play-circle-outline`,l=``;o&&(c=`mdi:stop-circle-outline`,l=`running`);let u=this._formatNextRun(e),d=e.mode===`finish_at`?`mdi:flag-checkered`:`mdi:play-circle-outline`,f=``,p=``,m=e.schedule||{};if(m.type===`fixed`&&(f=`mdi:clock-outline`,p=m.time||`--:--`),m.type===`sun`){f=m.event===`sunrise`?`mdi:weather-sunset-up`:`mdi:weather-sunset-down`;let e=m.offset_minutes||0;p=e===0?``:e>0?`+${e}m`:`${e}m`}let h=e.weather?.enabled===!0,g=[`mon`,`tue`,`wed`,`thu`,`fri`,`sat`,`sun`],_={mon:`Mo`,tue:`Di`,wed:`Mi`,thu:`Do`,fri:`Fr`,sat:`Sa`,sun:`So`},v=(e.weekdays||[]).sort((e,t)=>g.indexOf(e)-g.indexOf(t)).map(e=>_[e]).join(` `);return`
            <div class="program-row ${i}" data-id="${e.id}">

                <div class="program-left">
                    <div class="color-dot" style="background:${n}"></div>

                    ${t?`
                    <div class="program-admin">
                        <div class="program-delete" data-id="${e.id}">
                            <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </div>
                        <div class="program-edit" data-id="${e.id}">
                            <ha-icon icon="mdi:cog-outline"></ha-icon>
                        </div>
                    </div>
                    `:``}
                </div>

                <div class="program-center">

                    <div class="program-name">
                        ${e.name}
                    </div>

                    <div class="program-meta">

                        <ha-icon icon="${d}"></ha-icon>

                        <ha-icon icon="${f}"></ha-icon>
                        <span>${p}</span>

                        ${h?`
                            <span class="separator">•</span>
                            <ha-icon 
                                icon="mdi:weather-rainy"
                                class="weather-active">
                            </ha-icon>
                        `:``}

                        ${v?`
                            <span class="separator">•</span>
                            <ha-icon icon="mdi:calendar"></ha-icon>
                            <span>${v}</span>
                        `:``}
                        ${u}
                    </div>

                </div>

                <div class="program-action ${l}"
                    data-id="${e.id}"
                    data-state="${a}"
                    data-run-id="${s.program_run_id||``}">
                    <ha-icon icon="${c}"></ha-icon>
                </div>
            </div>
        `}attachEvents(){this.querySelectorAll(`.program-edit`).forEach(e=>{e.addEventListener(`click`,e=>{this._selectedProgramId=Number(e.currentTarget.dataset.id),this._view=`edit`,this._renderInternal(this.getData())})}),this.querySelectorAll(`.program-delete`).forEach(n=>{n.addEventListener(`click`,n=>{let r=Number(n.currentTarget.dataset.id);t({title:`Programm löschen`,text:`Wirklich löschen?`,confirmText:`Löschen`,danger:!0,parent:document.body,onConfirm:()=>{e(this,`sprinkler_ui_program_delete`,{program_id:r})}})})}),this.querySelector(`#showDisabledSwitch`)?.addEventListener(`change`,e=>{this._showDisabled=e.target.checked,this._renderInternal(this.getData())}),this.querySelector(`#addProgramBtn`)?.addEventListener(`click`,()=>{this._workingProgram={name:`Neues Programm`,enabled:!0,mode:`start_at`,policy:`strict`,weekdays:[],schedule:{type:`fixed`,time:`06:00`},weather:{enabled:!1},repeat:0,pause_minutes:0,zones:[]},this._isNewProgram=!0,this._view=`edit`,this._renderInternal(this.getData())}),this.querySelectorAll(`.program-action`).forEach(n=>{let r=null,i=!1,a=n.dataset.state,o=n.dataset.runId,s=()=>{let t=Number(n.dataset.id);i=!1,r=setTimeout(()=>{a===`queued`&&o&&(i=!0,e(this,`sprinkler_ui_program_skip`,{program_id:t}))},500)},c=()=>{r&&=(clearTimeout(r),null)};n.addEventListener(`click`,r=>{if(i)return;let a=Number(n.dataset.id),o=n.dataset.state,s=n.dataset.runId,c=this.config?.entity,l=this._hass.states[c]?.attributes?.programs?.find(e=>e.id===a)?.name;s||this.return,o===`running`?(t({title:`Programm stoppen`,text:`Programm wirklich stoppen?`,entityName:l,confirmText:`Stoppen`,danger:!0,parent:document.body,onConfirm:()=>{e(this,`sprinkler_ui_program_stop`,{program_run_id:s})}}),e(this,`sprinkler_ui_program_stop`,{program_id:a})):e(this,`sprinkler_ui_program_start`,{program_id:a})}),n.addEventListener(`pointerdown`,s),n.addEventListener(`pointerup`,c),n.addEventListener(`pointerleave`,c),n.addEventListener(`pointercancel`,c)})}_attachEditEvents(){this.querySelector(`#backBtn`)?.addEventListener(`click`,()=>{this._view=`list`,this._selectedProgramId=null,this._workingProgram=null,this._isNewProgram=!1,this._lastHash=null,this.hass=this._hass}),this.querySelector(`#saveBtn`)?.addEventListener(`click`,async()=>{let t=this._workingProgram,n={id:t.id,name:t.name,color:t.color,enabled:t.enabled,policy:t.policy,weekdays:t.weekdays,schedule:t.schedule,weather:t.weather,mode:t.mode,repeat:t.repeat,pause_minutes:t.pause_minutes,zones:t.zones};if(this._validationErrors=this._validateProgram(n),Object.keys(this._validationErrors).length>0){this._renderInternal(this.getData());return}console.log(n);try{this._isNewProgram?e(this,`sprinkler_ui_program_add`,{program:n}):e(this,`sprinkler_ui_program_update`,{program:n}),this._isNewProgram=!1,this._view=`list`,this._selectedProgramId=null,this._lastHash=null,this.hass=this._hass}catch(e){console.error(`Save failed:`,e)}});let t=this.querySelector(`#programNameDisplay`),n=this.querySelector(`#programNameInput`);t?.addEventListener(`click`,()=>{t.style.display=`none`,n.style.display=`block`,n.focus()}),n?.addEventListener(`blur`,()=>{this._workingProgram.name=n.value,this._renderInternal(this.getData())}),this.querySelector(`#colorInput`)?.addEventListener(`input`,e=>{this._workingProgram.color=e.target.value,this._renderInternal(this.getData())}),this.querySelector(`#enabledSwitch`)?.addEventListener(`change`,e=>{this._workingProgram.enabled=e.target.checked}),this.querySelector(`#weatherSwitch`)?.addEventListener(`change`,e=>{this._workingProgram.weather={...this._workingProgram.weather||{},enabled:e.target.checked}}),this.querySelectorAll(`.weekday-chip`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.day,n=this._workingProgram.weekdays||[];n=n.includes(t)?n.filter(e=>e!==t):[...n,t],this._workingProgram.weekdays=n,this._renderInternal(this.getData())})}),this.querySelectorAll(`input[name="scheduleType"]`).forEach(e=>{e.addEventListener(`change`,e=>{let t=e.target.value;t===`fixed`?this._workingProgram.schedule={type:`fixed`,time:this._workingProgram.schedule?.time||`06:00`}:this._workingProgram.schedule={type:`sun`,event:t,offset_minutes:this._workingProgram.schedule?.offset_minutes||0},this._renderInternal(this.getData())})}),this.querySelector(`#scheduleTimeInput`)?.addEventListener(`input`,e=>{this._workingProgram.schedule&&(this._workingProgram.schedule.time=e.target.value)}),this.querySelector(`#scheduleOffsetInput`)?.addEventListener(`input`,e=>{if(!this._workingProgram.schedule)return;let t=Number(e.target.value);this._workingProgram.schedule.offset_minutes=t;let n=this.querySelector(`.offset-value`);n&&(n.textContent=t===0?`0 min`:t>0?`+${t} min`:`${t} min`)}),this.querySelectorAll(`input[name="programMode"]`).forEach(e=>{e.addEventListener(`change`,e=>{this._workingProgram.mode=e.target.value})}),this.querySelector(`#repeatInput`)?.addEventListener(`input`,e=>{this._workingProgram.repeat=Number(e.target.value)}),this.querySelector(`#pauseInput`)?.addEventListener(`input`,e=>{this._workingProgram.pause_minutes=Number(e.target.value)}),this.querySelectorAll(`.zone-select`).forEach(e=>{e.addEventListener(`change`,e=>{let t=Number(e.target.dataset.index),n=Number(e.target.value);this._workingProgram.zones[t].zone_id=n,this._renderInternal(this.getData())})}),this.querySelectorAll(`.zone-slider input`).forEach((e,t)=>{e.addEventListener(`input`,e=>{let t=Number(e.target.closest(`.zone-slider`).dataset.index),n=Number(e.target.value);this._workingProgram.zones[t].duration=n*60;let r=this.querySelector(`.zone-duration-label[data-index="${t}"]`);r&&(r.textContent=`${n} min`)})}),this.querySelectorAll(`.zone-delete`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.index);this._workingProgram.zones.splice(t,1),this._renderInternal(this.getData())})}),this.querySelector(`.zone-add-row`)?.addEventListener(`click`,()=>{this._workingProgram.zones.push({zone_id:null,duration:600}),this._renderInternal(this.getData())});let r=null;this.querySelectorAll(`.zone-handle`).forEach(e=>{let t=e.closest(`.zone-card`);e.addEventListener(`dragstart`,()=>{r=Number(t.dataset.index),t.classList.add(`dragging`)}),e.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),this.querySelectorAll(`.zone-drop-indicator`).forEach(e=>e.remove())})}),this.querySelectorAll(`.zone-card`).forEach(e=>{e.addEventListener(`dragover`,t=>{if(t.preventDefault(),Number(e.dataset.index)===r)return;this.querySelectorAll(`.zone-drop-indicator`).forEach(e=>e.remove());let n=e.getBoundingClientRect(),i=t.clientY>n.top+n.height/2,a=document.createElement(`div`);a.className=`zone-drop-indicator`,i?e.after(a):e.before(a)}),e.addEventListener(`drop`,t=>{t.preventDefault();let n=Number(e.dataset.index);if(r===null||n===r)return;let i=e.getBoundingClientRect(),a=t.clientY>i.top+i.height/2,o=n;a&&o++;let s=[...this._workingProgram.zones],[c]=s.splice(r,1);r<o&&o--,s.splice(o,0,c),this._workingProgram.zones=s,r=null,this._renderInternal(this.getData())})})}getCardSize(){return 4}};customElements.define(`sprinklerv2-programs-card-v2`,i);