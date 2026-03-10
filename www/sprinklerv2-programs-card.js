import{r as y,c as u,i as m}from"./sprinkler-utils.js";const x=!1;console.log("🚀 SPRINKLER PROGRAMS CARD");class w extends HTMLElement{constructor(){super(),this._isDev=x,this._view="list",this._selectedProgramId=null,this._validationErrors={},this._activeDialog=null}connectedCallback(){this._hass&&y(this._hass),requestAnimationFrame(()=>{const e=this.querySelector("ha-card"),t=e.getBoundingClientRect().width;e.style.maxWidth=`${t}px`}),this._hass.connection.subscribeEvents(e=>{const t=e.data;console.log("Event data:",t),console.log("Pending:",this._pendingRequestId),t&&t.request_id===this._pendingRequestId&&(t.user_id&&t.user_id!==this._hass.user?.id||(this._pendingRequestId=null,this._requestTimeout&&(clearTimeout(this._requestTimeout),this._requestTimeout=null)))},"sprinkler_ui_feedback").then(e=>{this._unsubscribe=e})}disconnectedCallback(){this._unsubscribe&&(this._unsubscribe(),this._unsubscribe=null)}setConfig(e){if(!e.entity)throw new Error("Program entity (entity) is required");this.config={...e,zones_prefix:e.zones_prefix??e.entity.replace(/_programs?.*$/i,"_zone")},this._lastHash=null}_lockWidth(){const e=this.querySelector("ha-card");if(!e)return;const t=this.parentElement;if(!t)return;const n=t.getBoundingClientRect().width;e.style.maxWidth=`${n}px`,e.style.width="100%"}_closeActiveDialog(){this._activeDialog&&(this._activeDialog.close(),this._activeDialog=null)}_getZoneEntity(e){const t=this.config?.zones_prefix;if(!t)return null;const n=`${t}_${String(e).padStart(2,"0")}`;return this._hass.states[n]||null}_formatDuration(e){e=Number(e)||0;const t=Math.floor(e/3600),n=Math.floor(e%3600/60),i=e%60;return`${t.toString().padStart(2,"0")}:${n.toString().padStart(2,"0")}:${i.toString().padStart(2,"0")}`}_formatNextRun(e){let t;if(e.runtime?.state==="running"?t=e.runtime?.planned_end:t=e.runtime?.planned_start,!t)return"";const n=new Date,i=new Date(t),a=i-n;if(a<=0)return"";const o=Math.round(a/6e4),r=new Date,s=new Date;s.setDate(r.getDate()+1);const d=i.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});return e.runtime?.state==="running"?`· bis ${new Date(e.runtime?.planned_end).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:i.toDateString()===r.toDateString()?o<60?`· in ${o} min`:`· heute ${d}`:i.toDateString()===s.toDateString()?`· morgen ${d}`:`· ${i.toLocaleDateString("de-DE",{weekday:"short"})} ${d}`}_moveZone(e,t){const n=this._workingProgram.zones,i=e+t;if(i<0||i>=n.length)return;const a=n[e];n[e]=n[i],n[i]=a,this.renderDetail()}_attachDetailEvents(){this.querySelectorAll("input[name='programMode']").forEach(i=>{i.addEventListener("change",a=>{this._workingProgram.mode=a.target.value,this.renderDetail()})}),this.querySelectorAll(".weekday-chip").forEach(i=>{i.addEventListener("click",a=>{const o=a.currentTarget.dataset.day,r=this._workingProgram.weekdays||[];r.includes(o)?this._workingProgram.weekdays=r.filter(s=>s!==o):this._workingProgram.weekdays=[...r,o],this.renderDetail()})}),this.querySelector("#backBtn")?.addEventListener("click",()=>{this._view="list",this._selectedProgramId=null,this._workingProgram=null,this._isNewProgram=!1,this._lastHash=null,this.hass=this._hass}),this.querySelector("#policySelect")?.addEventListener("change",i=>{this._workingProgram.policy=i.target.value}),this.querySelector("#colorInput")?.addEventListener("input",i=>{this._workingProgram.color=i.target.value,this.renderDetail()}),this.querySelector("#enabledSwitch")?.addEventListener("change",i=>{this._workingProgram.enabled=i.target.checked}),this.querySelector("#weatherSwitch")?.addEventListener("change",i=>{this._workingProgram.weather={...this._workingProgram.weather,enabled:i.target.checked}});const e=this.querySelector("#programNameDisplay"),t=this.querySelector("#programNameInput");e?.addEventListener("click",()=>{e.style.display="none",t.style.display="inline-block",t.focus(),t.select()});const n=()=>{const i=t.value.trim()||"Ohne Name";this._workingProgram.name=i,e.innerText=i,t.style.display="none",e.style.display="inline-block"};t?.addEventListener("keydown",i=>{i.key==="Enter"&&n()}),t?.addEventListener("blur",n),this.querySelector("#saveBtn")?.addEventListener("click",async()=>{const i=this._workingProgram;if(this._validationErrors=this._validateProgram(i),Object.keys(this._validationErrors).length>0){this.renderDetail();return}try{this._isNewProgram?u(this,"sprinkler_ui_program_add",{program:i}):u(this,"sprinkler_ui_program_update",{program:i}),this._isNewProgram=!1,this._view="list",this._selectedProgramId=null,this._lastHash=null,this.hass=this._hass}catch(a){console.error("Save failed:",a)}}),this.querySelectorAll("input[name='scheduleType']").forEach(i=>{i.addEventListener("change",a=>{const o=a.target.value;o==="fixed"?this._workingProgram.schedule={type:"fixed",time:this._workingProgram.schedule?.time||"06:00"}:this._workingProgram.schedule={type:"sun",event:o,offset_minutes:this._workingProgram.schedule?.offset_minutes||0},this.renderDetail()})}),this.querySelector("#scheduleTimeInput")?.addEventListener("change",i=>{this._workingProgram.schedule.time=i.target.value}),this.querySelector("#scheduleOffsetInput")?.addEventListener("input",i=>{const a=Number(i.target.value);this._workingProgram.schedule={...this._workingProgram.schedule,type:"sun",offset_minutes:a},this.querySelector(".offset-value").innerText=`${a} min`}),this.querySelectorAll(".zone-delete").forEach(i=>{i.addEventListener("click",a=>{const o=Number(a.currentTarget.dataset.index);this._workingProgram.zones.splice(o,1),this.renderDetail()})}),this.querySelectorAll(".zone-slider").forEach(i=>{i.addEventListener("input",a=>{const o=Number(a.target.dataset.index),r=Number(a.target.value),s=Math.min(r,120);this._workingProgram.zones[o].duration=s*60,a.target.value=s,this.querySelectorAll(".zone-duration-label")[o].innerText=`${s} min`})}),this.querySelectorAll(".zone-select").forEach(i=>{i.addEventListener("change",a=>{const o=Number(a.target.dataset.index);this._workingProgram.zones[o].zone_id=Number(a.target.value),this.renderDetail()})}),this.querySelector(".zone-add-row")?.addEventListener("click",()=>{const i=this.getAllSystemZones(),a=this._workingProgram.zones.map(r=>r.zone_id),o=i.find(r=>!a.includes(r.id));o&&(this._workingProgram.zones.push({zone_id:o.id,duration:600}),this.renderDetail())})}_validateProgram(e){const t={};(!e.zones||e.zones.length===0)&&(t.zones="Mindestens eine Zone erforderlich.");const n=e.zones.map(i=>i.zone_id);return new Set(n).size!==n.length&&(t.zones="Eine Zone darf nur einmal vorkommen."),e.zones.some(i=>!i.duration||i.duration<=0)&&(t.zones="Ungültige Laufzeit."),(!e.weekdays||e.weekdays.length===0)&&(t.weekdays="Mindestens ein Wochentag erforderlich."),e.schedule?.type==="fixed"&&!e.schedule?.time&&(t.schedule="Uhrzeit fehlt."),t}_attachDragAndDrop(){const e=this.querySelectorAll(".zone-handle");if(!e.length)return;let t=null,n=null,i=null,a=!1;const o=6,r=()=>{const s=document.createElement("div");return s.className="zone-drop-indicator",s};e.forEach(s=>{s.addEventListener("pointerdown",d=>{d.target.closest(".zone-handle")&&(t=Number(s.closest(".zone-card").dataset.index),i=d.clientY,a=!1)}),window.addEventListener("pointermove",d=>{if(t===null)return;const h=Math.abs(d.clientY-i);if(!a){if(h<o)return;a=!0,this.querySelectorAll(".zone-card")[t].classList.add("dragging")}const p=[...this.querySelectorAll(".zone-card")],c=d.clientY;for(let l of p){const g=l.getBoundingClientRect();if(c<g.top+g.height/2){n||(n=r()),l.parentNode.insertBefore(n,l);return}}n||(n=r()),p[p.length-1].after(n)}),window.addEventListener("pointerup",()=>{if(t===null)return;if(!a){t=null;return}const d=this._workingProgram.zones,h=d.splice(t,1)[0],p=[...this.querySelectorAll(".zone-card")];let c=d.length;if(n){const l=n.nextElementSibling;c=p.indexOf(l),c<0&&(c=d.length),n.remove(),n=null}d.splice(c,0,h),t=null,a=!1,this.renderDetail()})})}_renderWeekdaySection(e){const t=["mon","tue","wed","thu","fri","sat","sun"],n={mon:"Mo",tue:"Di",wed:"Mi",thu:"Do",fri:"Fr",sat:"Sa",sun:"So"},i=e.weekdays||[];return`
            <div class="weekday-row">
            ${t.map(a=>`
                <div class="weekday-chip ${i.includes(a)?"active":""}"
                    data-day="${a}">
                ${n[a]}
                </div>
            `).join("")}
            </div>
        `}_renderSwitchRow(e){return`
            <div class="switch-row">

            <label class="switch-item">
                <input type="checkbox"
                    id="enabledSwitch"
                    ${e.enabled?"checked":""}>
                Aktiviert
            </label>

            <label class="switch-item">
                <input type="checkbox"
                    id="weatherSwitch"
                    ${e.weather?.enabled?"checked":""}>
                Wetter
            </label>

            </div>
        `}_renderColorSection(e){const t=e.color||"#4CAF50";return`
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
        `}_renderModeSection(e){const t=e.mode||"start_at";return`
            <div class="mode-radio-row">

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="start_at"
                        ${t==="start_at"?"checked":""}>
                    Startet ab
                </label>

                <label class="mode-radio">
                    <input type="radio"
                        name="programMode"
                        value="finish_at"
                        ${t==="finish_at"?"checked":""}>
                    Fertig bis
                </label>

            </div>
        `}_renderScheduleSection(e){const t=e.schedule||{type:"fixed",time:"06:00"},n=t.type==="fixed",i=t.type==="sun",a=t.event||"sunrise",o=t.offset_minutes||0;return`
        <div class="divider"></div>

        <div class="schedule-block">

            <!-- FIX -->
            <label class="schedule-option ${n?"active":""}">
                <input type="radio"
                    name="scheduleType"
                    value="fixed"
                    ${n?"checked":""}>
                <span>Fixe Uhrzeit</span>

                <input type="time"
                    id="scheduleTimeInput"
                    class="time-input"
                    value="${t.time||"06:00"}"
                    ${n?"":"disabled"}>
            </label>

            <!-- SUNRISE -->
            <label class="schedule-option ${i&&a==="sunrise"?"active":""}">
                <input type="radio"
                    name="scheduleType"
                    value="sunrise"
                    ${i&&a==="sunrise"?"checked":""}>
                <span>Sonnenaufgang</span>
            </label>

            <!-- SUNSET -->
            <label class="schedule-option ${i&&a==="sunset"?"active":""}">
                <input type="radio"
                    name="scheduleType"
                    value="sunset"
                    ${i&&a==="sunset"?"checked":""}>
                <span>Sonnenuntergang</span>
            </label>

            <!-- OFFSET -->
            <div class="offset-row ${i?"":"disabled"}">
                <input type="range"
                    id="scheduleOffsetInput"
                    min="-120"
                    max="120"
                    step="5"
                    value="${o}">
                <div class="offset-value">
                    ${o} min
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
            SWITCH ROW
            ========================= */

            .switch-row {
                display: flex;
                justify-content: space-between;
                margin-top: 10px;
            }

            .switch-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 14px;
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
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
                justify-content: center;
                min-width: 0;
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
                flex:1;
                min-width:0;
                display: flex;
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
    `}set hass(e){this._hass=e;const t=this.config?.entity,n=t?e.states[t]:null;if(!n)return;const i=n?.attributes?.programs??[],a=i.map(r=>({id:r.id,name:r.name,enabled:r.enabled,color:r.color,mode:r.mode,weekdays:r.weekdays,zoneCount:(r.zones||[]).length,runtime_state:r.runtime?.state,runtime_start:r.runtime?.planned_start,planned_end:r.runtime?.planned_end})),o=JSON.stringify({view:this._view,selected:this._selectedProgramId,data:a});o!==this._lastHash&&(this._lastHash=o,this._view==="detail"?this.renderDetail():(this.renderList(),this.update(i)))}render(){if(this._view==="detail"){this.renderDetail();return}this.renderList()}_row(e,t){return`
            <div class="detail-row">
            <div class="label">${e}</div>
            <div class="value">${t}</div>
            </div>
        `}_getAdminTooltip(e){return e==="edit"?"Programm bearbeiten":e==="delete"?"Programm löschen":""}_getActionTooltip(e){const t=e.runtime?.state;return t==="running"?"Programm stoppen":t==="queued"||t==="skipped"?"Jetzt starten":e.enabled?"":"Programm starten"}_renderProgramAction(e){const t=e.runtime?.state;return t==="running"?'<ha-icon icon="mdi:stop-circle-outline"></ha-icon>':t==="queued"?'<ha-icon icon="mdi:play-circle-outline"></ha-icon>':t==="skipped"?'<ha-icon icon="mdi:skip-forward"></ha-icon>':e.enabled?'<ha-icon icon="mdi:play-circle-outline"></ha-icon>':'<ha-icon icon="mdi:play-circle"></ha-icon>'}renderProgramZoneRow(e,t,n){const i=new Set(this._workingProgram.zones.filter((r,s)=>s!==t).map(r=>r.zone_id).filter(r=>r!=null));[...n].sort((r,s)=>r.zone_name.localeCompare(s.zone_name,"de",{sensitivity:"base"}));const a=n.filter(r=>!i.has(r.id)).sort((r,s)=>r.zone_name.localeCompare(s.zone_name,"de",{sensitivity:"base"})),o=Math.round(e.duration/60);return`
        <div class="zone-card" data-index="${t}">

            <div class="zone-handle">
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
            </div>

            <select class="zone-select" data-index="${t}">
                ${a.map(r=>`
                    <option value="${r.id}"
                        ${r.id===e.zone_id?"selected":""}>
                        ${r.zone_name}
                    </option>
                `).join("")}
            </select>

            <input type="range"
                class="zone-slider"
                min="1"
                max="120"
                step="1"
                value="${o}"
                data-index="${t}">

            <div class="zone-duration-label">
                ${o} min
            </div>

            <ha-icon icon="mdi:trash-can-outline"
                    class="zone-delete"
                    data-index="${t}"></ha-icon>

        </div>
        `}getAllSystemZones(){return Object.values(this._hass.states).filter(e=>{const t=this.config?.zones_prefix;if(!t||!e.entity_id.startsWith(t+"_"))return!1;const n=e.attributes||{};return!(n.enabled!==!0||!n.zone_name)}).map(e=>({id:Number(e.entity_id.split("_").pop()),zone_name:e.attributes.zone_name})).sort((e,t)=>e.id-t.id)}renderProgramZones(e){const t=this.getAllSystemZones();let n=e.zones.map((i,a)=>this.renderProgramZoneRow(i,a,t)).join("");return e.zones.length<t.length&&(n+=`
            <div class="zone-add-row">
                + Zone hinzufügen
            </div>
            `),`<div class="zone-container">${n}</div>`}renderDetail(){const e=this.config?.entity,t=e?this._hass.states[e]:null;if(!t)return;let n;if(this._isNewProgram)n=this._workingProgram;else{if(n=(t.attributes.programs||[]).find(a=>a.id===this._selectedProgramId),!n)return;(!this._workingProgram||this._workingProgram.id!==n.id)&&(this._workingProgram=JSON.parse(JSON.stringify(n)))}(!this._workingProgram||this._workingProgram.id!==n.id)&&(this._workingProgram=JSON.parse(JSON.stringify(n))),this._workingProgram&&(this._workingProgram.policy||(this._workingProgram.policy="strict"),this._workingProgram.name,this.innerHTML=`
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
            `:""}            
            </div>

        </ha-card>
        `,this._attachDetailEvents(),this._attachDragAndDrop())}renderList(){const e=m(this._hass),t=this.config?.entity,i=(t?this._hass.states[t]:null)?.attributes?.friendly_name,a=this.config?.title||i||"Programme",o=this._isDev?`${a} (DEV)`:a;this.innerHTML=`
            <ha-card>
            ${this.styles()}

            <div class="card-header">
                <div class="title">${o}</div>

                ${e?`
                    <div class="add-btn" id="addProgramBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                `:""}     
            </div>

            <div class="programs"></div>
            </ha-card>
        `,this._container=this.querySelector(".programs");const r=this.querySelector("#addProgramBtn");r&&r.addEventListener("click",()=>{this._workingProgram={name:"Neues Programm",enabled:!0,mode:"start_at",policy:"strict",weekdays:[],schedule:{type:"fixed",time:"06:00"},weather:{enabled:!1},zones:[]},this._isNewProgram=!0,this._view="detail",this._selectedProgramId=null,this._lastHash=null,this.hass=this._hass})}renderRow(e){const t=m(this._hass),n=e.color||"#9e9e9e",i=e.enabled?"":"disabled",a=e.mode==="finish_at"?"mdi:flag-checkered":"mdi:play-circle-outline";let o="",r="";const s=e.schedule||{};if(s.type==="fixed"&&(o="mdi:clock-outline",r=s.time||"--:--"),s.type==="sun"){o=s.event==="sunrise"?"mdi:weather-sunset-up":"mdi:weather-sunset-down";const l=s.offset_minutes||0;r=l===0?"":l>0?`+${l}m`:`${l}m`}const d=e.weather?.enabled===!0,h=["mon","tue","wed","thu","fri","sat","sun"],p={mon:"Mo",tue:"Di",wed:"Mi",thu:"Do",fri:"Fr",sat:"Sa",sun:"So"},c=(e.weekdays||[]).sort((l,g)=>h.indexOf(l)-h.indexOf(g)).map(l=>p[l]).join(" ");return`
            <div class="program-row ${i}" data-id="${e.id}">

                <div class="program-left">
                    <div class="color-dot" style="background:${n}"></div>
                </div>

                ${t?`
                <div class="program-admin">
                    <div class="program-delete" data-id="${e.id}" title="${this._getAdminTooltip("delete")}">
                        <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                    </div>
                    <div class="program-edit" data-id="${e.id}" title="${this._getAdminTooltip("edit")}">
                        <ha-icon icon="mdi:cog-outline"></ha-icon>
                    </div>
                </div>                
                `:""}

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
                        <span>${r}</span>

                        ${d?`
                            <span class="separator">•</span>
                            <ha-icon 
                                icon="mdi:weather-rainy"
                                class="weather-active">
                            </ha-icon>
                        `:""}

                        ${c?`
                            <span class="separator">•</span>
                            <ha-icon icon="mdi:calendar"></ha-icon>
                            <span>${c}</span>
                        `:""}

                    </div>

                </div>                
                <div class="program-action ${e.runtime?.state==="running"?"running":""}" 
                    data-id="${e.id}"
                    data-state="${e.runtime?.state||"idle"}"
                    data-run="${e.runtime?.program_run_id||""}"
                    title="${this._getActionTooltip(e)}">

                    ${this._renderProgramAction(e)}

                </div>
            </div>
        `}renderProgramHeader(e){return e.schedule?.type==="fixed"?`${e.schedule.time}`:`${e.schedule?.event||""}${e.schedule?.offset_minutes||0}`,`
        <div class="detail-block">

            ${this._renderSwitchRow(e)}
            <div class="divider"></div>
            
            ${this._renderWeekdaySection(e)}
            ${this._validationErrors.weekdays?`
                <div class="validation-error">
                    ${this._validationErrors.weekdays}
                </div>
            `:""}
            <div class="divider"></div>
            ${this._renderModeSection(e)}
            ${this._renderScheduleSection(e)}

        </div>
        `}update(e){this._container&&(this._container.innerHTML=e.map(t=>this.renderRow(t)).join(""),this.attachEvents())}attachEvents(){this.querySelectorAll(".program-edit").forEach(e=>{e.addEventListener("click",t=>{const n=Number(t.currentTarget.dataset.id);this._selectedProgramId=n,this._view="detail",this._lastHash=null,this.hass=this._hass})}),this.querySelectorAll(".program-action").forEach(e=>{let t=0;e.addEventListener("pointerdown",()=>{t=Date.now()}),e.addEventListener("pointerup",()=>{if(!t)return;const n=Date.now()-t,i=e.dataset.state,a=Number(e.dataset.id),o=e.dataset.run;if(n>=600){i==="queued"&&(navigator.vibrate?.(20,40,20),u(this,"sprinkler_ui_program_skip",{program_id:a}));return}if(i!=="running"){u(this,"sprinkler_ui_program_start",{program_id:a});return}o&&this._openStopDialog(o)})})}getCardSize(){return 4}_openDeleteDialog(e){const t=this.config?.entity,o=((t?this._hass.states[t]:null)?.attributes?.programs||[]).find(s=>s.id===e)?.name||`#${e}`,r=document.createElement("ha-dialog");document.body.appendChild(r),r.innerHTML=`
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
                ${o}
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
        `,this._activeDialog=r,setTimeout(()=>r.show(),0),r.querySelector("#cancelBtn").addEventListener("click",()=>{r.close()}),r.querySelector("#confirmBtn").addEventListener("click",()=>{u(this,"sprinkler_ui_program_delete",{program_id:e},{closeDialog:!1}),r.close()}),r.addEventListener("closed",()=>{r.remove(),this._activeDialog=null})}_openStopDialog(e){const t=document.createElement("ha-dialog");document.body.appendChild(t),t.innerHTML=`
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
        `,this._activeDialog=t,setTimeout(()=>t.show(),0),t.querySelector("#cancelBtn").onclick=()=>t.close(),t.querySelector("#stopBtn").onclick=()=>{u(this,"sprinkler_ui_program_stop",{program_run_id:e},{closeDialog:!1}),t.close()},t.addEventListener("closed",()=>{t.remove(),this._activeDialog=null})}}const f="sprinklerv2-programs-card";class _ extends w{}customElements.get(f)||customElements.define(f,_);
