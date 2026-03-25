import{i as e,n as t,r as n,t as r}from"./sprinklerv2-utils.js";var i=!1;console.log(`🚀 SPRINKLER PROGRAMS CARD`);var a=class extends HTMLElement{constructor(){super(),this._isDev=i,this._view=`list`,this._selectedProgramId=null,this._validationErrors={},this._activeDialog=null}connectedCallback(){this._hass&&e(this._hass),requestAnimationFrame(()=>{let e=this.querySelector(`ha-card`),t=e.getBoundingClientRect().width;e.style.maxWidth=`${t}px`}),this._hass.connection.subscribeEvents(e=>{let t=e.data;console.log(`Event data:`,t),console.log(`Pending:`,this._pendingRequestId),t&&t.request_id===this._pendingRequestId&&(t.user_id&&t.user_id!==this._hass.user?.id||(this._pendingRequestId=null,this._requestTimeout&&=(clearTimeout(this._requestTimeout),null)))},`sprinkler_ui_feedback`).then(e=>{this._unsubscribe=e})}disconnectedCallback(){this._unsubscribe&&=(this._unsubscribe(),null)}setConfig(e){if(!e.entity)throw Error(`Program entity (entity) is required`);this.config={...e,zones_prefix:e.zones_prefix??e.entity.replace(/_programs?.*$/i,`_zone`)},this._lastHash=null}_lockWidth(){let e=this.querySelector(`ha-card`);if(!e)return;let t=this.parentElement;if(!t)return;let n=t.getBoundingClientRect().width;e.style.maxWidth=`${n}px`,e.style.width=`100%`}_closeActiveDialog(){this._activeDialog&&=(this._activeDialog.open=!1,this._activeDialog.remove(),null)}_getZoneEntity(e){let t=this.config?.zones_prefix;if(!t)return null;let n=`${t}_${String(e).padStart(2,`0`)}`;return this._hass.states[n]||null}_formatDuration(e){e=Number(e)||0;let t=Math.floor(e/3600),n=Math.floor(e%3600/60),r=e%60;return`${t.toString().padStart(2,`0`)}:${n.toString().padStart(2,`0`)}:${r.toString().padStart(2,`0`)}`}_formatNextRun(e){let t;if(t=e.runtime?.state===`running`?e.runtime?.planned_end:e.runtime?.planned_start,!t)return``;let n=new Date,r=new Date(t),i=r-n;if(i<=0)return``;let a=Math.round(i/6e4),o=new Date,s=new Date;s.setDate(o.getDate()+1);let c=r.toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`});return e.runtime?.state===`running`?`· bis ${new Date(e.runtime?.planned_end).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`})}`:r.toDateString()===o.toDateString()?a<60?`· in ${a} min`:`· heute ${c}`:r.toDateString()===s.toDateString()?`· morgen ${c}`:`· ${r.toLocaleDateString(`de-DE`,{weekday:`short`})} ${c}`}_moveZone(e,t){let n=this._workingProgram.zones,r=e+t;if(r<0||r>=n.length)return;let i=n[e];n[e]=n[r],n[r]=i,this.renderDetail()}_attachDetailEvents(){this.querySelectorAll(`input[name='programMode']`).forEach(e=>{e.addEventListener(`change`,e=>{this._workingProgram.mode=e.target.value,this.renderDetail()})}),this.querySelectorAll(`.weekday-chip`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget.dataset.day,n=this._workingProgram.weekdays||[];n.includes(t)?this._workingProgram.weekdays=n.filter(e=>e!==t):this._workingProgram.weekdays=[...n,t],this.renderDetail()})}),this.querySelector(`#backBtn`)?.addEventListener(`click`,()=>{this._view=`list`,this._selectedProgramId=null,this._workingProgram=null,this._isNewProgram=!1,this._lastHash=null,this.hass=this._hass}),this.querySelector(`#policySelect`)?.addEventListener(`change`,e=>{this._workingProgram.policy=e.target.value}),this.querySelector(`#colorInput`)?.addEventListener(`input`,e=>{this._workingProgram.color=e.target.value,this.renderDetail()}),this.querySelector(`#enabledSwitch`)?.addEventListener(`change`,e=>{this._workingProgram.enabled=e.target.checked}),this.querySelector(`#weatherSwitch`)?.addEventListener(`change`,e=>{this._workingProgram.weather={...this._workingProgram.weather,enabled:e.target.checked}}),this.querySelector(`#repeatInput`)?.addEventListener(`change`,e=>{let t=Math.max(0,Number(e.target.value)||0);this._workingProgram.repeat=t,t===0&&(this._workingProgram.pause_minutes=0)}),this.querySelector(`#pauseInput`)?.addEventListener(`change`,e=>{let t=Math.max(0,Number(e.target.value)||0);this._workingProgram.pause_minutes=t});let e=this.querySelector(`#programNameDisplay`),t=this.querySelector(`#programNameInput`);e?.addEventListener(`click`,()=>{e.style.display=`none`,t.style.display=`inline-block`,t.focus(),t.select()});let r=()=>{let n=t.value.trim()||`Ohne Name`;this._workingProgram.name=n,e.innerText=n,t.style.display=`none`,e.style.display=`inline-block`};t?.addEventListener(`keydown`,e=>{e.key===`Enter`&&r()}),t?.addEventListener(`blur`,r),this.querySelector(`#saveBtn`)?.addEventListener(`click`,async()=>{let e=this._workingProgram;if(this._validationErrors=this._validateProgram(e),Object.keys(this._validationErrors).length>0){this.renderDetail();return}try{this._isNewProgram?n(this,`sprinkler_ui_program_add`,{program:e}):n(this,`sprinkler_ui_program_update`,{program:e}),this._isNewProgram=!1,this._view=`list`,this._selectedProgramId=null,this._lastHash=null,this.hass=this._hass}catch(e){console.error(`Save failed:`,e)}}),this.querySelectorAll(`input[name='scheduleType']`).forEach(e=>{e.addEventListener(`change`,e=>{let t=e.target.value;t===`fixed`?this._workingProgram.schedule={type:`fixed`,time:this._workingProgram.schedule?.time||`06:00`}:this._workingProgram.schedule={type:`sun`,event:t,offset_minutes:this._workingProgram.schedule?.offset_minutes||0},this.renderDetail()})}),this.querySelector(`#scheduleTimeInput`)?.addEventListener(`change`,e=>{this._workingProgram.schedule.time=e.target.value}),this.querySelector(`#scheduleOffsetInput`)?.addEventListener(`input`,e=>{let t=Number(e.target.value);this._workingProgram.schedule={...this._workingProgram.schedule,type:`sun`,offset_minutes:t},this.querySelector(`.offset-value`).innerText=`${t} min`}),this.querySelectorAll(`.zone-delete`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.index);this._workingProgram.zones.splice(t,1),this.renderDetail()})}),this.querySelectorAll(`.zone-slider`).forEach(e=>{e.addEventListener(`input`,e=>{let t=Number(e.target.dataset.index),n=Number(e.target.value),r=Math.min(n,120);this._workingProgram.zones[t].duration=r*60,e.target.value=r,this.querySelectorAll(`.zone-duration-label`)[t].innerText=`${r} min`})}),this.querySelectorAll(`.zone-select`).forEach(e=>{e.addEventListener(`change`,e=>{let t=Number(e.target.dataset.index);this._workingProgram.zones[t].zone_id=Number(e.target.value),this.renderDetail()})}),this.querySelector(`.zone-add-row`)?.addEventListener(`click`,()=>{let e=this.getAllSystemZones(),t=this._workingProgram.zones.map(e=>e.zone_id),n=e.find(e=>!t.includes(e.id));n&&(this._workingProgram.zones.push({zone_id:n.id,duration:600}),this.renderDetail())})}_validateProgram(e){let t={};(!e.zones||e.zones.length===0)&&(t.zones=`Mindestens eine Zone erforderlich.`);let n=e.zones.map(e=>e.zone_id);return new Set(n).size!==n.length&&(t.zones=`Eine Zone darf nur einmal vorkommen.`),e.zones.some(e=>!e.duration||e.duration<=0)&&(t.zones=`Ungültige Laufzeit.`),(!e.weekdays||e.weekdays.length===0)&&(t.weekdays=`Mindestens ein Wochentag erforderlich.`),e.schedule?.type===`fixed`&&!e.schedule?.time&&(t.schedule=`Uhrzeit fehlt.`),t}_attachDragAndDrop(){let e=this.querySelectorAll(`.zone-handle`);if(!e.length)return;let t=null,n=null,r=null,i=!1,a=()=>{let e=document.createElement(`div`);return e.className=`zone-drop-indicator`,e};e.forEach(e=>{e.addEventListener(`pointerdown`,n=>{n.target.closest(`.zone-handle`)&&(t=Number(e.closest(`.zone-card`).dataset.index),r=n.clientY,i=!1)}),window.addEventListener(`pointermove`,e=>{if(t===null)return;let o=Math.abs(e.clientY-r);if(!i){if(o<6)return;i=!0,this.querySelectorAll(`.zone-card`)[t].classList.add(`dragging`)}let s=[...this.querySelectorAll(`.zone-card`)],c=e.clientY;for(let e of s){let t=e.getBoundingClientRect();if(c<t.top+t.height/2){n||=a(),e.parentNode.insertBefore(n,e);return}}n||=a(),s[s.length-1].after(n)}),window.addEventListener(`pointerup`,()=>{if(t===null)return;if(!i){t=null;return}let e=this._workingProgram.zones,r=e.splice(t,1)[0],a=[...this.querySelectorAll(`.zone-card`)],o=e.length;if(n){let t=n.nextElementSibling;o=a.indexOf(t),o<0&&(o=e.length),n.remove(),n=null}e.splice(o,0,r),t=null,i=!1,this.renderDetail()})})}_renderWeekdaySection(e){let t=[`mon`,`tue`,`wed`,`thu`,`fri`,`sat`,`sun`],n={mon:`Mo`,tue:`Di`,wed:`Mi`,thu:`Do`,fri:`Fr`,sat:`Sa`,sun:`So`},r=e.weekdays||[];return`
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
        `}styles(){return`
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

            .slider-block {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .slider-block input[type="range"] {
                width: 100%;
            }

            .slider-block .slider-value {
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
    `}set hass(e){this._hass=e;let t=this.config?.entity,n=t?e.states[t]:null;if(!n)return;let r=n?.attributes?.programs??[],i=r.map(e=>({id:e.id,name:e.name,enabled:e.enabled,color:e.color,mode:e.mode,weekdays:e.weekdays,zoneCount:(e.zones||[]).length,runtime_state:e.runtime?.state,runtime_start:e.runtime?.planned_start,planned_end:e.runtime?.planned_end})),a=JSON.stringify({view:this._view,selected:this._selectedProgramId,data:i});a!==this._lastHash&&(this._lastHash=a,this._view===`detail`?this.renderDetail():(this.renderList(),this.update(r)))}render(){if(this._view===`detail`){this.renderDetail();return}this.renderList()}_row(e,t){return`
            <div class="detail-row">
            <div class="label">${e}</div>
            <div class="value">${t}</div>
            </div>
        `}_rowSliderFull(e,t,n,r,i,a=``,o=1){return`
            <div class="slider-block">

                <div class="label">${e}</div>

                <input type="range"
                    id="${t}"
                    min="${r}"
                    max="${i}"
                    step="${o}"
                    value="${n}">

                <div class="slider-value">
                    ${n} ${a}
                </div>

            </div>
        `}_rowToggle(e,t,n){return`
            <div class="detail-row toggle-row">
                <div class="label">${e}</div>
                <ha-switch id="${t}" ${n?`checked`:``}></ha-switch>
            </div>
        `}_getAdminTooltip(e){return e===`edit`?`Programm bearbeiten`:e===`delete`?`Programm löschen`:``}_getActionTooltip(e){let t=e.runtime?.state;return t===`running`?`Programm stoppen`:t===`queued`||t===`skipped`?`Jetzt starten`:e.enabled?``:`Programm starten`}_renderProgramAction(e){let t=e.runtime?.state;return t===`running`?`<ha-icon icon="mdi:stop-circle-outline"></ha-icon>`:t===`queued`?`<ha-icon icon="mdi:play-circle-outline"></ha-icon>`:t===`skipped`?`<ha-icon icon="mdi:skip-forward"></ha-icon>`:e.enabled?`<ha-icon icon="mdi:play-circle-outline"></ha-icon>`:`<ha-icon icon="mdi:play-circle"></ha-icon>`}renderProgramZoneRow(e,t,n){let r=new Set(this._workingProgram.zones.filter((e,n)=>n!==t).map(e=>e.zone_id).filter(e=>e!=null));[...n].sort((e,t)=>e.zone_name.localeCompare(t.zone_name,`de`,{sensitivity:`base`}));let i=n.filter(e=>!r.has(e.id)).sort((e,t)=>e.zone_name.localeCompare(t.zone_name,`de`,{sensitivity:`base`})),a=Math.round(e.duration/60);return`
        <div class="zone-card" data-index="${t}">

            <div class="zone-handle">
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
            </div>

            <select class="zone-select" data-index="${t}">
                ${i.map(t=>`
                    <option value="${t.id}"
                        ${t.id===e.zone_id?`selected`:``}>
                        ${t.zone_name}
                    </option>
                `).join(``)}
            </select>

            <input type="range"
                class="zone-slider"
                min="1"
                max="120"
                step="1"
                value="${a}"
                data-index="${t}">

            <div class="zone-duration-label">
                ${a} min
            </div>

            <ha-icon icon="mdi:trash-can-outline"
                    class="zone-delete"
                    data-index="${t}"></ha-icon>

        </div>
        `}getAllSystemZones(){return Object.values(this._hass.states).filter(e=>{let t=this.config?.zones_prefix;if(!t||!e.entity_id.startsWith(t+`_`))return!1;let n=e.attributes||{};return!(n.enabled!==!0||!n.zone_name)}).map(e=>({id:Number(e.entity_id.split(`_`).pop()),zone_name:e.attributes.zone_name})).sort((e,t)=>e.id-t.id)}renderProgramZones(e){let t=this.getAllSystemZones(),n=e.zones.map((e,n)=>this.renderProgramZoneRow(e,n,t)).join(``);return e.zones.length<t.length&&(n+=`
            <div class="zone-add-row">
                + Zone hinzufügen
            </div>
            `),`<div class="zone-container">${n}</div>`}renderDetail(){let e=this.config?.entity,t=e?this._hass.states[e]:null;if(!t)return;let n;if(this._isNewProgram)n=this._workingProgram;else{if(n=(t.attributes.programs||[]).find(e=>e.id===this._selectedProgramId),!n)return;(!this._workingProgram||this._workingProgram.id!==n.id)&&(this._workingProgram=JSON.parse(JSON.stringify(n)))}(!this._workingProgram||this._workingProgram.id!==n.id)&&(this._workingProgram=JSON.parse(JSON.stringify(n))),this._workingProgram&&(this._workingProgram.policy||(this._workingProgram.policy=`strict`),this._workingProgram.name,this.innerHTML=`
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
            ${this._validationErrors.zones?`
                <div class="validation-error">
                    ${this._validationErrors.zones}
                </div>
            `:``}            
            </div>

        </ha-card>
        `,this._attachDetailEvents(),this._attachDragAndDrop())}renderList(){let e=r(this._hass),t=this.config?.entity,n=(t?this._hass.states[t]:null)?.attributes?.friendly_name,i=this.config?.title||n||`Programme`,a=this._isDev?`${i} (DEV)`:i;this.innerHTML=`
            <ha-card>
            ${this.styles()}

            <div class="card-header">
                <div class="title">${a}</div>

                ${e?`
                    <div class="add-btn" id="addProgramBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                `:``}     
            </div>

            <div class="programs"></div>
            </ha-card>
        `,this._container=this.querySelector(`.programs`);let o=this.querySelector(`#addProgramBtn`);o&&o.addEventListener(`click`,()=>{this._workingProgram={name:`Neues Programm`,enabled:!0,mode:`start_at`,policy:`strict`,weekdays:[],schedule:{type:`fixed`,time:`06:00`},weather:{enabled:!1},repeat:0,pause_minutes:0,zones:[]},this._isNewProgram=!0,this._view=`detail`,this._selectedProgramId=null,this._lastHash=null,this.hass=this._hass})}renderRow(e){let t=r(this._hass),n=e.color||`#9e9e9e`,i=e.enabled?``:`disabled`,a=e.mode===`finish_at`?`mdi:flag-checkered`:`mdi:play-circle-outline`,o=``,s=``,c=e.schedule||{};if(c.type===`fixed`&&(o=`mdi:clock-outline`,s=c.time||`--:--`),c.type===`sun`){o=c.event===`sunrise`?`mdi:weather-sunset-up`:`mdi:weather-sunset-down`;let e=c.offset_minutes||0;s=e===0?``:e>0?`+${e}m`:`${e}m`}let l=e.weather?.enabled===!0,u=[`mon`,`tue`,`wed`,`thu`,`fri`,`sat`,`sun`],d={mon:`Mo`,tue:`Di`,wed:`Mi`,thu:`Do`,fri:`Fr`,sat:`Sa`,sun:`So`},f=(e.weekdays||[]).sort((e,t)=>u.indexOf(e)-u.indexOf(t)).map(e=>d[e]).join(` `);return`
            <div class="program-row ${i}" data-id="${e.id}">

                <div class="program-left">
                    <div class="color-dot" style="background:${n}"></div>


                    ${t?`
                    <div class="program-admin">
                        <div class="program-delete" data-id="${e.id}" title="${this._getAdminTooltip(`delete`)}">
                            <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </div>
                        <div class="program-edit" data-id="${e.id}" title="${this._getAdminTooltip(`edit`)}">
                            <ha-icon icon="mdi:cog-outline"></ha-icon>
                        </div>
                    </div>                
                    `:``}
                </div>
                <div class="program-center">

                    <div class="program-name">
                        ${e.name}
                        <span class="program-next">
                          ${this._formatNextRun(e)}
                        </span>
                    </div>

                    <div class="program-meta">

                        <!-- Mode -->
                        <ha-icon icon="${a}"></ha-icon>

                        <!-- Schedule -->
                        <ha-icon icon="${o}"></ha-icon>
                        <span>${s}</span>

                        ${l?`
                            <span class="separator">•</span>
                            <ha-icon 
                                icon="mdi:weather-rainy"
                                class="weather-active">
                            </ha-icon>
                        `:``}

                        ${f?`
                            <span class="separator">•</span>
                            <ha-icon icon="mdi:calendar"></ha-icon>
                            <span>${f}</span>
                        `:``}

                    </div>

                </div>                
                <div class="program-action ${e.runtime?.state===`running`?`running`:``}" 
                    data-id="${e.id}"
                    data-state="${e.runtime?.state||`idle`}"
                    data-run="${e.runtime?.program_run_id||``}"
                    title="${this._getActionTooltip(e)}">

                    ${this._renderProgramAction(e)}

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
        `}renderProgramHeader(e){return e.schedule?.type===`fixed`?`${e.schedule.time}`:`${e.schedule?.event||``}${e.schedule?.offset_minutes||0}`,`
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
        `}update(e){this._container&&(this._container.innerHTML=e.map(e=>this.renderRow(e)).join(``),this.attachEvents())}attachEvents(){this.querySelectorAll(`.program-edit`).forEach(e=>{e.addEventListener(`click`,e=>{this._selectedProgramId=Number(e.currentTarget.dataset.id),this._view=`detail`,this._lastHash=null,this.hass=this._hass})}),this.querySelectorAll(`.program-delete`).forEach(e=>{e.addEventListener(`click`,e=>{let r=Number(e.currentTarget.dataset.id),i=this.config?.entity;t({title:`Programm löschen`,text:`Programm wirklich löschen?`,entityName:((i?this._hass.states[i]:null)?.attributes?.programs||[]).find(e=>e.id===r)?.name||`#${r}`,confirmText:`Löschen`,danger:!0,parent:document.body,onConfirm:()=>{n(this,`sprinkler_ui_program_delete`,{program_id:r})}})})}),this.querySelectorAll(`.program-action`).forEach(e=>{let r=null,i=!1,a=e.querySelector(`ha-icon`);e.addEventListener(`pointerdown`,()=>{i=!1,r=setTimeout(()=>{i=!0,a.setAttribute(`icon`,`mdi:skip-forward`),navigator.vibrate?.(30)},600)}),e.addEventListener(`pointerup`,()=>{clearTimeout(r);let a=e.dataset.state,o=Number(e.dataset.id),s=e.dataset.run;if(i){a===`queued`&&n(this,`sprinkler_ui_program_skip`,{program_id:o});return}if(a!==`running`){n(this,`sprinkler_ui_program_start`,{program_id:o});return}if(!s)return;let c=this.config?.entity,l=this._hass.states[c]?.attributes?.programs?.find(e=>e.id===o)?.name;t({title:`Programm stoppen`,text:`Programm wirklich stoppen?`,entityName:l,confirmText:`Stoppen`,danger:!0,parent:document.body,onConfirm:()=>{n(this,`sprinkler_ui_program_stop`,{program_run_id:s})}})}),e.addEventListener(`pointerleave`,()=>{i||a.setAttribute(`icon`,`mdi:play-circle-outline`),clearTimeout(r)})})}getCardSize(){return 4}},o=`sprinklerv2-programs-card`,s=class extends a{};customElements.get(o)||customElements.define(o,s);