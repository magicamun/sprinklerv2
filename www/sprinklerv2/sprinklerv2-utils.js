console.log(`EVENT MODULE LOADED`);var e={ZONE_STARTED:({entity_id:e,duration:t})=>`Zone ${e} gestartet für ${Math.round(t/60)} Minuten`,ZONE_CANCELLED:({entity_id:e})=>`Zone ${e} abgebrochen`,ZONE_EXTENDED:({entity_id:e,duration:t})=>`Zone ${e} verlängert um ${Math.round(t/60)} Minuten`,ZONE_UPDATED:({entity_id:e})=>`Zone ${e} aktualisiert`,ZONE_DELETED:({entity_id:e})=>`Zone ${e} gelöscht`,ZONE_FINISHED:({entity_id:e})=>`Zone ${e} beendet`,ZONE_ADDED:({entity_id:e})=>`Zone ${e} angelegt`,ZONE_RUNNING:({entity_id:e})=>`Zone ${e} läuft`,ZONE_QUEUED:({entity_id:e})=>`Zone ${e} wartet`,ZONE_IN_PROGRAM:({entity_id:e})=>`Zone ${e} ist Teile eines Programms`,ZONE_INVALID_PAYLOAD:({})=>`Ungültige, Keine Payload für Service`,ZONE_NOT_FOUND:({entity_id:e})=>`Zone ${e} nicht gefunden`,ZONE_NOT_RUNNING:({entity_id:e})=>`Zone ${e} läuft nicht`,ZONE_NOT_QUEUED:({entity_id:e})=>`Zone ${e} nicht eingereiht`,ZONE_NOT_CANCELLED:({entity_id:e})=>`Zone ${e} nicht abgebrochen`,ZONE_NOT_UPDATED:({entity_id:e})=>`Zone ${e} nicht geändert`,ZONE_IDLE:({entity_id:e})=>`Zone ${e} ist Inaktiv`,ZONE_IGNORED:({entity_id:e})=>`Zone ${e} ignoriert`,ZONE_NOT_ADDED:({entity_id:e})=>`Zone ${e} nicht hinzugefügt`,ZONE_ACTIVE:({entity_id:e})=>`Zone ${e} aktiv`,ZONE_SOIL_RESET:({entity_id:e})=>`Soil Reset for Zone ${e}`,PROGRAM_STARTED:({entity_id:e})=>`Programm ${e} gestartet`,PROGRAM_CANCELLED:({entity_id:e})=>`Programm ${e} abgebrochen`,PROGRAM_COMPLETED:({entity_id:e})=>`Programm ${e} beendet`,PROGRAM_CONFLICT:({})=>`Programmkonflikt`,PROGRAM_NOT_FOUND:({entity_id:e})=>`Programm ${e} nicht gefunden`,PROGRAM_NOT_ADDED:({entity_id:e})=>`Programm ${e} nicht hinzugefügt`,PROGRAM_NOT_UPDATED:({entity_id:e})=>`Programm ${e} nicht geändert`,PROGRAM_NOT_DELETED:({entity_id:e})=>`Programm ${e} nicht gelöscht`,PROGRAM_ADDED:({entity_id:e})=>`Programm ${e} hinzugefügt`,PROGRAM_UPDATED:({entity_id:e})=>`Programm ${e} geändert`,PROGRAM_DELETED:({entity_id:e})=>`Programm ${e} gelöscht`,PROGRAM_NOT_STARTED:({entity_id:e})=>`Programm ${e} nicht gestartet`,PROGRAM_NOT_RUNNING:({entity_id:e})=>`Programm ${e} läuft nicht`,PROGRAM_NOT_STOPPED:({entity_id:e})=>`Programm ${e} nicht gestoppt`,PROGRAM_STOPPED:({entity_id:e})=>`Programm ${e} gestoppt`,PROGRAM_NOT_SKIPPED:({entity_id:e})=>`Programm ${e} n. Lauf nicht übersprungen`,PROGRAM_SKIPPED:({entity_id:e})=>`Programm ${e} n. Lauf übersprungen`,SCHEDULER_STARTED:({})=>`Scheduler gestartet`,SCHEDULER_STOPPED:({})=>`Scheduler gestoppt`,SCHEDULER_ERROR:({})=>`Scheduler - Fehler`,USER_NOT_ADMIN:({entity_id:e})=>`User ${e} hat keine Berechtuigung`,INTERNAL_ERROR:({})=>`Ìnterner Fehler`,INTERNAL_PROGRAMS_CHANGED:({})=>`Programme Geändert`};function t(e,t=`info`){let n=document.querySelector(`home-assistant`);n&&n.dispatchEvent(new CustomEvent(`hass-notification`,{bubbles:!0,composed:!0,detail:{message:e,...t===`error`?{type:`error`}:{}}}))}var n=!1;function r(r){!r||n||(n=!0,r.connection.subscribeEvents(n=>{if(n.event_type!==`sprinkler_ui_feedback`)return;let r=n.data,i=e[r.code];i&&t(i({...r,...r.data||{}}),r.status)},`sprinkler_ui_feedback`))}function i(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():`req-`+Date.now()+`-`+Math.random().toString(16).slice(2)}function a(e,n,r=8e3){return setTimeout(()=>{e._pendingRequestId===n&&(e._pendingRequestId=null,t(`Keine Rückmeldung vom Backend`,`error`),e._closeActiveDialog&&e._closeActiveDialog())},r)}function o(e,t,n={},{closeDialog:r=!0}={}){console.log(`callServiceWithRequest Start`);let o=i();return e._pendingRequestId=o,e._hass.callService(`pyscript`,t,{...n,request_id:o}),e._requestTimeout=a(e,o),r&&e._closeActiveDialog(e),console.log(`callServiceWithRequest End`),o}console.log(`Module Utils loaded`);function s(e){return e?.user?.is_admin===!0}function c({title:e,text:t,entityName:n=null,confirmText:r=`OK`,danger:i=!1,onConfirm:a}){let o=document.createElement(`ha-dialog`);document.body.appendChild(o),console.log(`entity:`),console.log(n),o.innerHTML=`
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
    `,setTimeout(()=>o.open=!0,0);let s=o.querySelector(`#cancelBtn`),c=o.querySelector(`#confirmBtn`);c.onclick=()=>{o.open=!1,setTimeout(()=>o.remove(),150),a?.()},s.onclick=()=>o.close(),s.onclick=()=>{o.open=!1},o.addEventListener(`closed`,()=>o.remove())}export{r as i,c as n,o as r,s as t};