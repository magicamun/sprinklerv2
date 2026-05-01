console.log(`EVENT MODULE LOADED`);var e={ZONE_STARTED:({entity_id:e,duration:t})=>`Zone ${e} gestartet für ${Math.round(t/60)} Minuten`,ZONE_CANCELLED:({entity_id:e})=>`Zone ${e} abgebrochen`,ZONE_EXTENDED:({entity_id:e,duration:t})=>`Zone ${e} verlängert um ${Math.round(t/60)} Minuten`,ZONE_UPDATED:({entity_id:e})=>`Zone ${e} aktualisiert`,ZONE_DELETED:({entity_id:e})=>`Zone ${e} gelöscht`,ZONE_FINISHED:({entity_id:e})=>`Zone ${e} beendet`,ZONE_ADDED:({entity_id:e})=>`Zone ${e} angelegt`,ZONE_RUNNING:({entity_id:e})=>`Zone ${e} läuft`,ZONE_QUEUED:({entity_id:e})=>`Zone ${e} wartet`,ZONE_IN_PROGRAM:({entity_id:e})=>`Zone ${e} ist Teile eines Programms`,ZONE_INVALID_PAYLOAD:({})=>`Ungültige, Keine Payload für Service`,ZONE_NOT_FOUND:({entity_id:e})=>`Zone ${e} nicht gefunden`,ZONE_NOT_RUNNING:({entity_id:e})=>`Zone ${e} läuft nicht`,ZONE_NOT_QUEUED:({entity_id:e})=>`Zone ${e} nicht eingereiht`,ZONE_NOT_CANCELLED:({entity_id:e})=>`Zone ${e} nicht abgebrochen`,ZONE_NOT_UPDATED:({entity_id:e})=>`Zone ${e} nicht geändert`,ZONE_IDLE:({entity_id:e})=>`Zone ${e} ist Inaktiv`,ZONE_IGNORED:({entity_id:e})=>`Zone ${e} ignoriert`,ZONE_NOT_ADDED:({entity_id:e})=>`Zone ${e} nicht hinzugefügt`,ZONE_ACTIVE:({entity_id:e})=>`Zone ${e} aktiv`,ZONE_SOIL_RESET:({entity_id:e})=>`Soil Reset for Zone ${e}`,PROGRAM_STARTED:({entity_id:e})=>`Programm ${e} gestartet`,PROGRAM_CANCELLED:({entity_id:e})=>`Programm ${e} abgebrochen`,PROGRAM_COMPLETED:({entity_id:e})=>`Programm ${e} beendet`,PROGRAM_CONFLICT:({})=>`Programmkonflikt`,PROGRAM_NOT_FOUND:({entity_id:e})=>`Programm ${e} nicht gefunden`,PROGRAM_NOT_ADDED:({entity_id:e})=>`Programm ${e} nicht hinzugefügt`,PROGRAM_NOT_UPDATED:({entity_id:e})=>`Programm ${e} nicht geändert`,PROGRAM_NOT_DELETED:({entity_id:e})=>`Programm ${e} nicht gelöscht`,PROGRAM_ADDED:({entity_id:e})=>`Programm ${e} hinzugefügt`,PROGRAM_UPDATED:({entity_id:e})=>`Programm ${e} geändert`,PROGRAM_DELETED:({entity_id:e})=>`Programm ${e} gelöscht`,PROGRAM_NOT_STARTED:({entity_id:e})=>`Programm ${e} nicht gestartet`,PROGRAM_NOT_RUNNING:({entity_id:e})=>`Programm ${e} läuft nicht`,PROGRAM_NOT_STOPPED:({entity_id:e})=>`Programm ${e} nicht gestoppt`,PROGRAM_STOPPED:({entity_id:e})=>`Programm ${e} gestoppt`,PROGRAM_NOT_SKIPPED:({entity_id:e})=>`Programm ${e} n. Lauf nicht übersprungen`,PROGRAM_SKIPPED:({entity_id:e})=>`Programm ${e} n. Lauf übersprungen`,SCHEDULER_STARTED:({})=>`Scheduler gestartet`,SCHEDULER_STOPPED:({})=>`Scheduler gestoppt`,SCHEDULER_ERROR:({})=>`Scheduler - Fehler`,USER_NOT_ADMIN:({entity_id:e})=>`User ${e} hat keine Berechtuigung`,INTERNAL_ERROR:({})=>`Ìnterner Fehler`,INTERNAL_PROGRAMS_CHANGED:({})=>`Programme Geändert`};function t(e,t=`info`){let n=document.querySelector(`home-assistant`);n&&n.dispatchEvent(new CustomEvent(`hass-notification`,{bubbles:!0,composed:!0,detail:{message:e,...t===`error`?{type:`error`}:{}}}))}function n(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():`req-`+Date.now()+`-`+Math.random().toString(16).slice(2)}function r(e,t,r={},{closeDialog:i=!0}={}){let a=n();e._lastRequestId=a,e._pendingRequests||=new Map;let o=setTimeout(()=>{e._pendingRequests.delete(a),e._handleRequestTimeout?.(a)},5e3);return e._pendingRequests.set(a,{timeout:o}),e._hass.callService(`pyscript`,t,{...r,request_id:a}),i&&e._closeActiveDialog?.(),a}function i(n){if(n.event_type!==`sprinkler_ui_feedback`)return;let r=n.data,i=e[r.code];i&&t(i({...r,...r.data||{}}),r.status)}var a=class extends HTMLElement{constructor(){super(),this._hass=null,this._config=null,this._lastHash=null,this._pendingRequests=new Map}set hass(e){this._hass=e,!this._feedbackRegistered&&e&&(this._feedbackRegistered=!0,e.connection.subscribeEvents(e=>this._handleFeedback(e),`sprinkler_ui_feedback`).then(e=>{this._unsubscribe=e}));let t=this.getData?.(),n=this._getRenderState?.(t)??t,r=JSON.stringify(n);if(r===this._lastHash){this._updateRuntime?.(t);return}this._lastHash=r,this._renderInternal(t)}setConfig(e){this._config=e}disconnectedCallback(){this._unsubscribe&&(this._unsubscribe(),this._unsubscribe=null,this._feedbackRegistered=!1)}_handleRequestSuccess(e){}_handleFeedback(e){i(e);let t=e.data;if(!t||!t?.request_id)return;let n=this._pendingRequests?.get(t.request_id);n&&(clearTimeout(n.timeout),this._pendingRequests.delete(t.request_id),this._handleRequestSuccess?.(t))}_renderInternal(e){this._data=e,this.innerHTML=`
            <ha-card>
                ${this.baseStyles()}
                ${this.styles?.()||``}
                ${this.render(e)}
            </ha-card>
        `,this._afterRender()}_afterRender(){this._view===`edit`?this._attachEditEvents?.():this.attachEvents?.()}_stripRuntime(e){return Array.isArray(e)?e.map(e=>({entity_id:e.entity_id,state:e.state,enabled:e.attributes?.enabled,zone_id:e.attributes?.zone_id,zone_name:e.attributes?.zone_name,deleted:e.attributes?.deleted,soil:e.attributes?.soil_mm,deficit:e.attributes?.deficit_mm})):e}baseStyles(){return`
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
        `}getData(){return{}}render(e){return``}};console.log(`Module Utils loaded`);function o(e){return e?.user?.is_admin===!0}function s({title:e,text:t,entityName:n=null,confirmText:r=`OK`,danger:i=!1,onConfirm:a}){let o=document.createElement(`ha-dialog`);document.body.appendChild(o),console.log(`entity:`),console.log(n),o.innerHTML=`
    <style>
        .sp-dialog {
        padding: 18px 20px 16px;
        min-width: 280px;
        text-align: center;
        }

        .sp-dialog-title {
        font-size: 17px;
        font-weight: 600;
        margin-bottom: 10px;
        }

        .sp-dialog-body {
        font-size: 14px;
        opacity: 0.7;
        margin-bottom: 6px;
        }

        .sp-dialog-entity {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 18px;
        }

        .sp-dialog-actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        }

        .sp-btn {
        padding: 8px 16px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 500;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        min-width: 100px;
        text-align: center;
        }

        .sp-btn.primary {
        background: var(--primary-color);
        color: white;
        border: none;
        }

        .sp-btn.danger {
        background: #e53935;
        color: white;
        border: none;
        }

        .sp-btn:active {
        opacity: 0.85;
        }
    </style>

    <div class="sp-dialog">
        <div class="sp-dialog-title">
        🗑️ ${e}
        </div>
        <div class="sp-dialog-body">
        ${t}
        </div>

        ${n?`
        <div class="sp-dialog-entity">
            ${n}
        </div>
        `:``}

        <div class="sp-dialog-actions">
        <div id="cancelBtn" class="sp-btn">Abbrechen</div>
        <div id="confirmBtn" class="sp-btn ${i?`danger`:`primary`}">
            ${r}
        </div>
        </div>
    </div>
    `,setTimeout(()=>o.open=!0,0);let s=o.querySelector(`#cancelBtn`),c=o.querySelector(`#confirmBtn`);c.onclick=()=>{o.open=!1,setTimeout(()=>o.remove(),150),a?.()},s.onclick=()=>o.close(),s.onclick=()=>{o.open=!1},o.addEventListener(`closed`,()=>o.remove())}export{r as i,s as n,a as r,o as t};