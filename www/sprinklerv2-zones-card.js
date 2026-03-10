import{r as E,c as v,i as w}from"./sprinkler-utils.js";class D extends HTMLElement{constructor(){super(),this._connected=!1,this._showDisabled=!1,this._pendingRequestId=null,this._activeDialog=null,this._zonePrefix=null,this._isDev=!1}_getZonePrefix(){return this.config?.entity?this.config.entity.replace(/_\d+$/,""):null}_getZoneEntity(t){const e=this._getZonePrefix();return e?`${e}_${String(t).padStart(2,"0")}`:null}setConfig(t){this.config=t}set hass(t){this._hass=t,requestAnimationFrame(()=>{const e=this.querySelector("ha-card"),i=e.getBoundingClientRect().width;e.style.maxWidth=`${i}px`}),this._initialized||(this.render(),this._initialized=!0),!this._feedbackRegistered&&t&&E(t),this._zonePrefix||(this._zonePrefix=this._getZonePrefix()),this.update()}connectedCallback(){this._connected||(requestAnimationFrame(()=>{const t=this.querySelector("ha-card"),e=t.getBoundingClientRect().width;t.style.maxWidth=`${e}px`}),this._connected=!0,this._hass.connection.subscribeEvents(t=>{const e=t.data;console.log("Event data:",e),console.log("Pending:",this._pendingRequestId),e&&e.request_id===this._pendingRequestId&&(e.user_id&&e.user_id!==this._hass.user?.id||(this._pendingRequestId=null,this._requestTimeout&&(clearTimeout(this._requestTimeout),this._requestTimeout=null)))},"sprinkler_ui_feedback").then(t=>{this._unsubscribe=t}),console.log("HA version:",this._hass.config.version))}_closeActiveDialog(){this._activeDialog&&(this._activeDialog.open=!1,setTimeout(()=>{this._activeDialog?.remove(),this._activeDialog=null},150))}getCardSize(){return 6}openEditDialog(t=null){this._closeActiveDialog();const e=document.createElement("ha-dialog"),i=Number(this._hass.states["input_number.sprinkler_capacity"]?.state)||1;this.appendChild(e),setTimeout(()=>{e.open=!0},0);const n=t===null;let a="",s=1,d=1,l=10,p=30,u=!0,r="";if(!n){const o=this._getZoneEntity(t),_=this._hass.states[o];if(!_)return;const f=_.attributes;a=f.zone_name||"",s=f.load||1,d=f.zone_factor||1,l=f.precipitation_rate_mm_per_hour||10,p=Math.floor((f.default_duration||600)/60),u=f.enabled??!0,r=f.switch||""}const c=Object.values(this._hass.states).filter(o=>o.entity_id.startsWith("switch.")).sort((o,_)=>o.entity_id.localeCompare(_.entity_id)).map(o=>`
      <option value="${o.entity_id}"
        ${o.entity_id===r?"selected":""}>
        ${o.entity_id}
      </option>
    `).join("");e.innerHTML=`
      <style>
        ha-dialog {
          --mdc-dialog-min-width: 280px;
          --mdc-dialog-max-width: 420px;
        }
        .dialog-content {
          padding: 0;
          min-width: 280px;
          max-width: 92vw;
        }

        .dialog-header {
          background: var(--primary-color);
          color: white;
          padding: 12px 14px;
          font-size: 17px;
          font-weight: 600;
        }

        .dialog-body {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 13px;
          font-weight: 500;
          opacity: 0.7;
        }

        select, input[type="text"] {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color);
        }

        .slider-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        ha-slider {
          flex: 1;
        }

        .value-label {
          font-size: 14px;
          font-weight: 600;
          min-width: 60px;
          text-align: right;
        }

        .actions {
          display: flex;
          justify-content: space-between;
          padding: 10px 12px;
        }

        .action-btn {
          padding: 8px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          border: 1px solid var(--divider-color);
        }

        .save-btn {
          background: var(--primary-color);
          color: white;
          border: none;
        }
      </style>

      <div class="dialog-content">
        <div class="dialog-header">
          ${n?"Neue Zone anlegen":`Zone ${t} bearbeiten`}
        </div>

        <div class="dialog-body">

          <div class="field">
            <label>Name</label>
            <input id="zone_name" type="text" value="${a}" />
          </div>

          <div class="field">
            <label>Switch</label>
            <select id="switch">
              ${c}
            </select>
          </div>

          <div class="field">
            <label>Standardlaufzeit (Min)</label>
            <div class="slider-row">
              <ha-slider id="duration"
                min="1" max="240" step="1"
                value="${p}" pin>
              </ha-slider>
              <div id="durationVal" class="value-label">
                ${p}
              </div>
            </div>
          </div>

          <div class="field">
            <label>Load</label>
            <div class="slider-row">
              <ha-slider id="load"
                min="1" max="${i}"
                value="${s}" pin>
              </ha-slider>
              <div id="loadVal" class="value-label">
                ${s}
              </div>
            </div>
          </div>

          <div class="field">
            <label>Zone Factor</label>
            <div class="slider-row">
              <ha-slider id="factor"
                min="0" max="3" step="0.1"
                value="${d}" pin>
              </ha-slider>
              <div id="factorVal" class="value-label">
                ${d.toFixed(1)}
              </div>
            </div>
          </div>

          <div class="field">
            <label>Precipitation (mm/h)</label>
            <div class="slider-row">
              <ha-slider id="precip"
                min="1" max="30" step="1"
                value="${l}" pin>
              </ha-slider>
              <div id="precipVal" class="value-label">
                ${l}
              </div>
            </div>
          </div>

          <div class="field">
            <label>
              <input id="enabled" type="checkbox" ${u?"checked":""}/>
              Aktiviert
            </label>
          </div>

        </div>

        <div class="actions">
          <div id="cancelBtn" class="action-btn">
            Abbrechen
          </div>
          <div id="saveBtn" class="action-btn save-btn">
            Speichern
          </div>
        </div>
      </div>
    `;const g=e.querySelector("#duration"),b=e.querySelector("#factor"),x=e.querySelector("#precip"),y=e.querySelector("#load"),z=e.querySelector("#durationVal"),m=e.querySelector("#factorVal"),q=e.querySelector("#precipVal"),$=e.querySelector("#loadVal");g.addEventListener("input",o=>z.textContent=o.target.value),b.addEventListener("input",o=>m.textContent=Number(o.target.value).toFixed(1)),x.addEventListener("input",o=>q.textContent=o.target.value),y.addEventListener("input",o=>$.textContent=o.target.value),e.querySelector("#cancelBtn").addEventListener("click",()=>{e.open=!1}),e.querySelector("#saveBtn").addEventListener("click",()=>{this._activeDialog=e;const o={zone_id:t,name:e.querySelector("#zone_name").value,switch:e.querySelector("#switch").value,default_duration:Number(g.value)*60,load:Number(y.value),zone_factor:Number(b.value),precipitation_rate_mm_per_hour:Number(x.value),enabled:e.querySelector("#enabled").checked};v(this,n?"sprinkler_ui_zone_add":"sprinkler_ui_zone_update",{zone:o}),e.close()}),e.addEventListener("transitionend",()=>{e.open||e.remove()})}openDurationDialog(t,e,i){this._closeActiveDialog();const n=document.createElement("ha-dialog");this.appendChild(n),setTimeout(()=>{n.open=!0},0);const a=this._getZoneEntity(t);if(!a)return;const s=this._hass.states[a];if(!s)return;const d=s.attributes?.default_duration||600,l=`${a}_remaining`,p=this._hass.states[l],u=Number(p?.state)||d;let r=Math.max(1,Math.floor(e==="running"?u/60:d/60));const h=e==="running",c=e==="queued",g=h?"Restlaufzeit einstellen":"Laufzeit einstellen",b=h?"Setzen":c?"Übernehmen":"Start";n.innerHTML=`
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
          ${g}
        </div>

        <div class="dialog-body">
          <div id="value" class="value-display">
            ${r} min
          </div>

          <div class="slider-row">
            <div id="minus" class="step-btn">−</div>

            <ha-slider
              id="slider"
              min="1"
              max="120"
              step="1"
              value="${r}"
              pin
            ></ha-slider>

            <div id="plus" class="step-btn">+</div>
          </div>
        </div>

        <div class="actions">
          <div id="cancelBtn" class="action-btn cancel-btn">
            Abbrechen
          </div>

          ${h?`
                <div id="stopBtn" class="action-btn cancel-btn">
                  Stoppen
                </div>
                <div id="extendBtn" class="action-btn start-btn">
                  ${b}
                </div>
              `:`
                <div id="startBtn" class="action-btn start-btn">
                  ${b}
                </div>
              `}
        </div>
      </div>
    `;const x=n.querySelector("#slider"),y=n.querySelector("#value");function z(){y.textContent=`${r} min`,x.value=r}x.addEventListener("change",m=>{r=Number(m.target.value),z()}),n.querySelector("#cancelBtn").addEventListener("click",()=>{n.open=!1}),h?(n.querySelector("#stopBtn").addEventListener("click",()=>{this._activeDialog=n,v(this,"sprinkler_ui_cancel_zone",{qe_id:i})}),n.querySelector("#extendBtn").addEventListener("click",()=>{this._activeDialog=n,v(this,"sprinkler_ui_extend_zone",{qe_id:i,duration:r*60})})):n.querySelector("#startBtn").addEventListener("click",()=>{const m=c?"sprinkler_ui_extend_zone":"sprinkler_ui_start_zone";this._activeDialog=n,v(this,m,{qe_id:i,duration:r*60})}),n.addEventListener("transitionend",()=>{n.open||n.remove()})}openDeleteDialog(t){this._closeActiveDialog();const e=document.createElement("ha-dialog");this.appendChild(e),setTimeout(()=>{e.open=!0},0),e.innerHTML=`
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
    `,e.querySelector("#cancelBtn").addEventListener("click",()=>{e.open=!1}),e.querySelector("#confirmBtn").addEventListener("click",()=>{this._activeDialog=e,v(this,"sprinkler_ui_zone_delete",{zone_id:t})}),e.addEventListener("transitionend",()=>{e.open||e.remove()})}openCancelDialog(t,e){const i=document.createElement("ha-dialog");this.appendChild(i),setTimeout(()=>{i.open=!0},0),i.innerHTML=`
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
    `,setTimeout(()=>i.show(),0),i.querySelector("#cancelBtn").addEventListener("click",()=>{i.open=!1}),i.querySelector("#confirmBtn").addEventListener("click",()=>{this._activeDialog=i,v(this,"sprinkler_ui_cancel_zone",{qe_id:e})}),i.addEventListener("transitionend",()=>{i.open||i.remove()})}render(){const t=w(this._hass),e=this.config?.title??this._hass?.states[this.config?.entity]?.attributes?.title??"Sprinkler Zones",i=this._isDev?`${e} (Dev)`:e;this.innerHTML=`
      <ha-card>
        ${this.styles()}

        <div class="card-header">
          <div class="header-left">
            ${i}
          </div>

          <div class="header-right">

            ${t?`
                  <div class="show-disabled">
                    <ha-switch id="toggleDisabled"></ha-switch>
                    <span>Disabled</span>
                  </div>
                `:""}

            ${t?`
                  <div class="add-btn" id="addZoneBtn">
                    <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                  </div>
                `:""}

          </div>
        </div>

        <div class="zones"></div>

      </ha-card>
    `,this._container=this.querySelector(".zones");const n=this.querySelector("#toggleDisabled");t&&n&&n.addEventListener("change",s=>{this._showDisabled=s.target.checked,this.update()});const a=this.querySelector("#addZoneBtn");t&&a&&a.addEventListener("click",()=>{this.openEditDialog(null)})}update(){if(!this._hass||!this._container)return;const t=this._getZonePrefix();if(!t)return;const e=Object.values(this._hass.states).filter(i=>i.entity_id.startsWith(t+"_")).filter(i=>i.attributes&&i.attributes.zone_id!==void 0).filter(i=>!i.attributes.deleted).filter(i=>this._showDisabled||i.attributes.enabled===!0).sort((i,n)=>i.entity_id.localeCompare(n.entity_id));this._container.innerHTML=e.map(i=>this.renderRow(i)).join(""),this.attachEvents()}getDisplayedDuration(t,e){const i=this._getZonePrefix();if(!i)return;const n=`${i}_${String(t).padStart(2,"0")}_remaining`,a=this._hass.states[n]?.state;if(a!=null&&a!=="")return this.formatDuration(a);const s=e.attributes.default_duration||0;return this.formatDuration(s)}renderRow(t){const e=w(this._hass),i=t.state,n=t.attributes.zone_name||`Zone ${t.attributes.zone_id}`,a=t.attributes.zone_id,s=t.attributes.qe_id,d=t.attributes.enabled,l=d?"":"disabled",p=i==="running"||i==="queued"||i==="enqueue"?"mdi:stop-circle-outline":"mdi:play-circle-outline",u=d?this.stateColor(i):"#bdbdbd",r=this.getDisplayedDuration(a,t),h=t.attributes.soil_mm??null,c=t.attributes.deficit_mm??null;let g="";const b=c===0?"#43a047":c>5?"#fb8c00":"#e53935";return h!==null&&c!==null&&(g=`
        <div class="zone-soil">
          <ha-icon icon="mdi:water"> </ha-icon>
          ${h.toFixed(1)}
          <ha-icon icon="mdi:water-minus" style="color:${b}"></ha-icon>
          ${c.toFixed(1)}
        </div>
      `),`
      <div class="zone-row ${l}" data-zone="${a}" data-qe="${s??""}">
        
        ${e?`
          <div class="zone-left">
            <div class="zone-delete" data-action="delete" data-zone="${a}">
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </div>
            <div class="zone-edit" data-action="edit" data-zone="${a}">
              <ha-icon icon="mdi:cog-outline"></ha-icon>
            </div>
            <div class="zone-soil-reset" data-zone="${a}">
              <ha-icon icon="mdi:water-sync"></ha-icon>
            </div>
          </div>
        `:""}

        <div class="zone-center" data-action="config" data-zone="${a}">
          <div class="zone_name">${n}</div>
          <div class="zone-sub">Laufzeit: ${r}</div>
          ${g}
        </div>
        <div class="zone-action" data-action="toggle" data-zone="${a}">
          <ha-icon icon="${p}" style="color:${u};"></ha-icon>
        </div>

      </div>
    `}formatDuration(t){t=Number(t)||0;const e=Math.floor(t/3600),i=Math.floor(t%3600/60),n=t%60;return`${e.toString().padStart(2,"0")}:${i.toString().padStart(2,"0")}:${n.toString().padStart(2,"0")}`}stateColor(t){return t==="running"?"#e53935":t==="queued"||t==="enqueue"?"#fb8c00":"#9e9e9e"}attachEvents(){this.querySelectorAll(".zone-center").forEach(t=>{t.addEventListener("click",e=>{const i=e.currentTarget.closest(".zone-row"),n=Number(i.dataset.zone),a=i.dataset.qe||null,s=this._getZoneEntity(n),d=this._hass.states[s];if(!d)return;const{source:l,zone_id:p}=d.attributes,u=d.state;if(l!=="manual"){this.openProgramInfoDialog(n);return}this.openDurationDialog(n,u,a)})}),this.querySelectorAll(".zone-delete").forEach(t=>{t.addEventListener("click",e=>{const i=Number(e.currentTarget.dataset.zone);this.openDeleteDialog(i)})}),this.querySelectorAll(".zone-edit").forEach(t=>{t.addEventListener("click",e=>{const i=Number(e.currentTarget.dataset.zone);this.openEditDialog(i)})}),this.querySelectorAll(".zone-soil-reset").forEach(t=>{t.addEventListener("click",e=>{const i=Number(e.currentTarget.dataset.zone);v(this,"sprinkler_ui_reset_soil",{zone_id:i})})}),this.querySelectorAll(".zone-action").forEach(t=>{t.addEventListener("click",e=>{const i=e.currentTarget.closest(".zone-row"),n=Number(i.dataset.zone),a=i.dataset.qe||null,s=this._getZoneEntity(n),d=this._hass.states[s]?.state;d==="running"||d==="queued"?this.openCancelDialog(n,a):v(this,"sprinkler_ui_start_zone",{qe_id:a})})})}styles(){return`
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
      </style>
    `}}const k="sprinklerv2-zones-card";class L extends D{}customElements.get(k)||customElements.define(k,L);
