import{i as e,n as t,r as n,t as r}from"./sprinklerv2-utils.js";var i={lawn:`Rasen`,bed_sun:`Beet (volle Sonne)`,bed_dense:`Beet (dicht bewachsen)`,pot_outdoor:`Topf (Regen)`,pot_protected:`Topf (geschützt)`},a={lawn:{eto_factor:1,rain_factor:1},bed_sun:{eto_factor:.8,rain_factor:1},bed_dense:{eto_factor:.6,rain_factor:.6},pot_outdoor:{eto_factor:.5,rain_factor:.5},pot_protected:{eto_factor:.5,rain_factor:0}},o=class extends HTMLElement{constructor(){super(),this._connected=!1,this._showDisabled=!1,this._pendingRequestId=null,this._activeDialog=null,this._zonePrefix=null,this._isDev=!1,this._view=`list`,this._workingZone=null,this._selectedZone=null,this._isNewZone=!1}_getZonePrefix(){return this.config?.entity?this.config.entity.replace(/_\d+$/,``):null}_getZoneEntity(e){let t=this._getZonePrefix();return t?`${t}_${String(e).padStart(2,`0`)}`:null}_attachEditEvents(){let e=this._workingZone;this.querySelector(`#backBtn`)?.addEventListener(`click`,()=>{this._view=`list`,this._workingZone=null,this.render()}),[`durationInput`,`loadInput`,`factorInput`,`precipInput`,`rainInput`].forEach(e=>{let t=this.querySelector(`#${e}`),n=this.querySelector(`#${e}_val`);t?.addEventListener(`input`,e=>{n.innerText=e.target.value})}),this.querySelector(`#typeInput`)?.addEventListener(`change`,e=>{let t=e.target.value;console.log(t);let n=a[t];if(!n)return;console.log(t),this._workingZone.type=t,this._workingZone.eto_factor=n.eto_factor,this._workingZone.rain_factor=n.rain_factor;let r=this.querySelector(`#factorInput`);r&&(r.value=n.eto_factor,this.querySelector(`#factorInput_val`).innerText=n.eto_factor.toFixed(1));let i=this.querySelector(`#rainInput`);i&&(i.value=n.rain_factor,this.querySelector(`#rainInput_val`).innerText=n.rain_factor.toFixed(1))}),this.querySelector(`#saveBtn`)?.addEventListener(`click`,()=>{e.name=this.querySelector(`#zoneNameInput`).value,e.switch=this.querySelector(`#switchInput`).value,e.default_duration=Number(this.querySelector(`#durationInput`).value)*60,e.load=Number(this.querySelector(`#loadInput_val`).innerText),e.eto_factor=Number(this.querySelector(`#factorInput`).value),e.rain_factor=Number(this.querySelector(`#rainInput`).value),e.precipitation_rate_mm_per_hour=Number(this.querySelector(`#precipInput`).value),e.enabled=this.querySelector(`#enabledInput`).checked;let t=this._isNewZone?`sprinkler_ui_zone_add`:`sprinkler_ui_zone_update`;n(this,t,{zone:e}),this._view=`list`,this._workingZone=null,this.render()});let t=this.querySelector(`#zoneNameDisplay`),r=this.querySelector(`#zoneNameInput`);if(t&&r){t.addEventListener(`click`,()=>{t.style.display=`none`,r.style.display=`inline-block`,r.focus(),r.select()});let n=()=>{let n=r.value.trim()||`Neue Zone`;e.name=n,t.innerText=n,r.style.display=`none`,t.style.display=`inline-block`};r.addEventListener(`keydown`,e=>{e.key===`Enter`&&n()}),r.addEventListener(`blur`,n)}let i=this.querySelector(`#loadInput_val`);this.querySelector(`#loadInput_minus`)?.addEventListener(`click`,()=>{let e=Number(i.innerText);e>1&&(e--,i.innerText=e)}),this.querySelector(`#loadInput_plus`)?.addEventListener(`click`,()=>{let e=Number(i.innerText),t=Number(this._hass.states[`input_number.sprinkler_capacity`]?.state)||1;e<t&&(e++,i.innerText=e)})}setConfig(e){this.config=e}set hass(t){this._hass=t,requestAnimationFrame(()=>{let e=this.querySelector(`ha-card`),t=e.getBoundingClientRect().width;e.style.maxWidth=`${t}px`}),this._initialized||=(this.render(),!0),!this._feedbackRegistered&&t&&e(t),this._zonePrefix||=this._getZonePrefix(),this.update()}connectedCallback(){this._connected||(requestAnimationFrame(()=>{let e=this.querySelector(`ha-card`),t=e.getBoundingClientRect().width;e.style.maxWidth=`${t}px`}),this._connected=!0,this._hass.connection.subscribeEvents(e=>{let t=e.data;console.log(`Event data:`,t),console.log(`Pending:`,this._pendingRequestId),t&&t.request_id===this._pendingRequestId&&(t.user_id&&t.user_id!==this._hass.user?.id||(this._pendingRequestId=null,this._requestTimeout&&=(clearTimeout(this._requestTimeout),null)))},`sprinkler_ui_feedback`).then(e=>{this._unsubscribe=e}),console.log(`HA version:`,this._hass.config.version))}_closeActiveDialog(){this._activeDialog&&(this._activeDialog.open=!1,setTimeout(()=>{this._activeDialog?.remove(),this._activeDialog=null},150))}getCardSize(){return 6}openDurationDialog(e,t,r){this._closeActiveDialog();let i=document.createElement(`ha-dialog`);this.appendChild(i),setTimeout(()=>{i.open=!0},0);let a=this._getZoneEntity(e);if(!a)return;let o=this._hass.states[a];if(!o)return;let s=o.attributes?.default_duration||600,c=`${a}_remaining`,l=this._hass.states[c],u=Number(l?.state)||s,d=Math.max(1,Math.floor(t===`running`?u/60:s/60)),f=t===`running`,p=t===`queued`,m=f?`Restlaufzeit einstellen`:`Laufzeit einstellen`,h=f?`Setzen`:p?`Übernehmen`:`Start`;i.innerHTML=`
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
          ${m}
        </div>

        <div class="dialog-body">
          <div id="value" class="value-display">
            ${d} min
          </div>

          <div class="slider-row">
            <div id="minus" class="step-btn">−</div>

            <ha-slider
              id="slider"
              min="1"
              max="120"
              step="1"
              value="${d}"
              pin
            ></ha-slider>

            <div id="plus" class="step-btn">+</div>
          </div>
        </div>

        <div class="actions">
          <div id="cancelBtn" class="action-btn cancel-btn">
            Abbrechen
          </div>

          ${f?`
                <div id="stopBtn" class="action-btn cancel-btn">
                  Stoppen
                </div>
                <div id="extendBtn" class="action-btn start-btn">
                  ${h}
                </div>
              `:`
                <div id="startBtn" class="action-btn start-btn">
                  ${h}
                </div>
              `}
        </div>
      </div>
    `;let g=i.querySelector(`#slider`),_=i.querySelector(`#value`),v=i.querySelector(`#minus`),y=i.querySelector(`#plus`),b=Number(g.min),x=Number(g.max);function S(){_.textContent=`${d} min`,g.value=d}let C;y.addEventListener(`mousedown`,()=>{C=setInterval(()=>{d<x&&(d++,S())},150)}),[`mouseup`,`mouseleave`].forEach(e=>y.addEventListener(e,()=>clearInterval(C))),v.addEventListener(`mousedown`,()=>{C=setInterval(()=>{d>b&&(d--,S())},150)}),[`mouseup`,`mouseleave`].forEach(e=>v.addEventListener(e,()=>clearInterval(C))),v?.addEventListener(`click`,()=>{d>b&&(d--,S())}),y?.addEventListener(`click`,()=>{d<x&&(d++,S())}),g.addEventListener(`input`,e=>{d=Number(e.target.value),S()}),i.querySelector(`#cancelBtn`).addEventListener(`click`,()=>{i.open=!1}),f?(i.querySelector(`#stopBtn`).addEventListener(`click`,()=>{this._activeDialog=i,n(this,`sprinkler_ui_cancel_zone`,{qe_id:r})}),i.querySelector(`#extendBtn`).addEventListener(`click`,()=>{this._activeDialog=i,n(this,`sprinkler_ui_extend_zone`,{qe_id:r,duration:d*60})})):i.querySelector(`#startBtn`).addEventListener(`click`,()=>{let e=p?`sprinkler_ui_extend_zone`:`sprinkler_ui_start_zone`;this._activeDialog=i,n(this,e,{qe_id:r,duration:d*60})}),i.addEventListener(`transitionend`,()=>{i.open||i.remove()})}openDeleteDialog(e){this._closeActiveDialog();let t=document.createElement(`ha-dialog`);this.appendChild(t),setTimeout(()=>{t.open=!0},0),t.innerHTML=`
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
    `,t.querySelector(`#cancelBtn`).addEventListener(`click`,()=>{t.open=!1}),t.querySelector(`#confirmBtn`).addEventListener(`click`,()=>{this._activeDialog=t,n(this,`sprinkler_ui_zone_delete`,{zone_id:e})}),t.addEventListener(`transitionend`,()=>{t.open||t.remove()})}render(){if(this._view===`edit`){this.renderEditView();return}this.renderListView()}renderListView(){let e=r(this._hass),t=this.config?.title??this._hass?.states[this.config?.entity]?.attributes?.title??`Sprinkler Zones`,n=this._isDev?`${t} (Dev)`:t;this.innerHTML=`
      <ha-card>
        ${this.styles()}

        <div class="card-header">
          <div class="header-left">
            ${n}
          </div>

          <div class="header-right">

            ${e?`
                  <div class="show-disabled">
                    <ha-switch id="toggleDisabled"></ha-switch>
                    <span>Disabled</span>
                  </div>
                `:``}

            ${e?`
                  <div class="add-btn" id="addZoneBtn">
                    <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                  </div>
                `:``}

          </div>
        </div>

        <div class="zones"></div>

      </ha-card>
    `,this._container=this.querySelector(`.zones`);let i=this.querySelector(`#toggleDisabled`);e&&i&&i.addEventListener(`change`,e=>{this._showDisabled=e.target.checked,this.update()});let a=this.querySelector(`#addZoneBtn`);e&&a&&a.addEventListener(`click`,()=>{this._workingZone={name:``,switch:``,type:`lawn`,default_duration:600,load:1,eto_factor:1,rain_factor:1,precipitation_rate_mm_per_hour:10,enabled:!0},this._isNewZone=!0,this._view=`edit`,this.render()})}renderEditView(){console.log(`workingZone:`,this._workingZone);let e=this._workingZone,t=Number(this._hass.states[`input_number.sprinkler_capacity`]?.state)||1,n=Object.values(this._hass.states).filter(e=>e.entity_id.startsWith(`switch.`)).sort((e,t)=>e.entity_id.localeCompare(t.entity_id)),r=a[e.type]||{},o=e.eto_factor!==r.eto_factor||e.rain_factor!==r.rain_factor?`Typ (angepasst)`:`Typ`;this.innerHTML=`
      <ha-card>
        ${this.styles()}

        <div class="card-header">

          <div class="back-btn" id="backBtn">
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </div>

          <div class="title-inline-wrapper">
            <span id="zoneNameDisplay" class="title-inline-display">
              ${e.name||`Neue Zone`}
            </span>

            <input id="zoneNameInput"
              class="title-inline-input"
              type="text"
              value="${e.name||``}"
              style="display:none;" />
          </div>

          <div class="save-btn" id="saveBtn">
            <ha-icon icon="mdi:content-save-outline"></ha-icon>
          </div>

        </div>

        <div class="detail-content">
          <div class="detail-block">
            ${this._rowToggle(`Aktiviert`,`enabledInput`,e.enabled)}
            ${this._rowSelect(`Switch`,`switchInput`,n.map(e=>({value:e.entity_id,label:e.entity_id})),e.switch)}

            ${this._rowSelect(o,`typeInput`,Object.entries(i).map(([e,t])=>({value:e,label:t})),e.type||`lawn`)}

            <div class="divider"></div>

            ${this._rowSliderCompact(`Laufzeit`,`durationInput`,Math.floor((e.default_duration||600)/60),1,240,`min`)}

            ${this._rowSliderCompact(`Precipitation`,`precipInput`,e.precipitation_rate_mm_per_hour||10,1,30,`mm/h`)}

            <div class="divider"></div>

            ${this._rowStepper(`Load`,`loadInput`,e.load||1,1,t)}

            ${this._rowSliderCompact(`ETo Factor`,`factorInput`,e.eto_factor??1,.1,2,``,.1)}

            ${this._rowSliderCompact(`Rain Factor`,`rainInput`,e.rain_factor??1,0,1,``,.1)}
          </div>
        </div>
      </ha-card>
    `,this._attachEditEvents()}_rowStepper(e,t,n,r,i){return`
      <div class="detail-row stepper-row">

        <div class="label">${e}</div>

        <div class="stepper">
          <div class="step-btn" id="${t}_minus">−</div>
          <div class="step-value" id="${t}_val">${n}</div>
          <div class="step-btn" id="${t}_plus">+</div>
        </div>

      </div>
    `}_rowInput(e,t,n=``){return`
      <div class="detail-row">
        <div class="label">${e}</div>
        <input id="${t}" value="${n||``}">
      </div>
    `}_rowSelect(e,t,n,r){return`
      <div class="detail-row">
        <div class="label">${e}</div>
        <select id="${t}">
          ${n.map(e=>`
            <option value="${e.value}"
              ${e.value===r?`selected`:``}>
              ${e.label}
            </option>
          `).join(``)}
        </select>
      </div>
    `}_rowToggle(e,t,n){return`
      <div class="detail-row toggle-row">
        <div class="label">${e}</div>
        <ha-switch id="${t}" ${n?`checked`:``}></ha-switch>
      </div>
    `}_rowSliderCompact(e,t,n,r,i,a=``,o=1){return`
      <div class="slider-row">

        <div class="label">${e}</div>

        <input type="range"
          id="${t}"
          min="${r}"
          max="${i}"
          step="${o}"
          value="${n}">

        <div class="slider-value">
          <span id="${t}_val">${n}</span> ${a}
        </div>

      </div>
    `}update(){if(!this._hass||!this._container)return;let e=this._getZonePrefix();if(!e)return;let t=Object.values(this._hass.states).filter(t=>t.entity_id.startsWith(e+`_`)).filter(e=>e.attributes&&e.attributes.zone_id!==void 0).filter(e=>!e.attributes.deleted).filter(e=>this._showDisabled||e.attributes.enabled===!0).sort((e,t)=>e.entity_id.localeCompare(t.entity_id));this._container.innerHTML=t.map(e=>this.renderRow(e)).join(``),this.attachEvents()}getDisplayedDuration(e,t){let n=this._getZonePrefix();if(!n)return;let r=`${n}_${String(e).padStart(2,`0`)}_remaining`,i=this._hass.states[r]?.state;if(i!=null&&i!==``)return this.formatDuration(i);let a=(t.attributes.zone||{}).default_duration||0;return this.formatDuration(a)}renderRow(e){let t=r(this._hass),n=e.state,i=(e.attributes.zone||{}).name||e.attributes.zone_name||`Zone ${e.attributes.zone_id}`,a=e.attributes.zone_id,o=e.attributes.qe_id,s=e.attributes.enabled,c=s?``:`disabled`,l=n===`running`||n===`queued`||n===`enqueue`?`mdi:stop-circle-outline`:`mdi:play-circle-outline`,u=s?this.stateColor(n):`#bdbdbd`,d=this.getDisplayedDuration(a,e),f=e.attributes.soil_mm??null,p=e.attributes.deficit_mm??null,m=``,h=p===0?`#43a047`:p>5?`#fb8c00`:`#e53935`;return f!==null&&p!==null&&(m=`
        <div class="zone-soil">
          <ha-icon icon="mdi:water"> </ha-icon>
          ${f.toFixed(1)}
          <ha-icon icon="mdi:water-minus" style="color:${h}"></ha-icon>
          ${p.toFixed(1)}
        </div>
      `),`
      <div class="zone-row ${c}" data-zone="${a}" data-qe="${o??``}">
        
        ${t?`
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
        `:``}

        <div class="zone-center" data-action="config" data-zone="${a}">
          <div class="zone_name">${i}</div>
          <div class="zone-sub">Laufzeit: ${d}</div>
          ${m}
        </div>
        <div class="zone-action" data-action="toggle" data-zone="${a}">
          <ha-icon icon="${l}" style="color:${u};"></ha-icon>
        </div>

      </div>
    `}formatDuration(e){e=Number(e)||0;let t=Math.floor(e/3600),n=Math.floor(e%3600/60),r=e%60;return`${t.toString().padStart(2,`0`)}:${n.toString().padStart(2,`0`)}:${r.toString().padStart(2,`0`)}`}stateColor(e){return e===`running`?`#e53935`:e===`queued`||e===`enqueue`?`#fb8c00`:`#9e9e9e`}attachEvents(){this.querySelectorAll(`.zone-center`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget.closest(`.zone-row`),n=Number(t.dataset.zone),r=t.dataset.qe||null,i=this._getZoneEntity(n),a=this._hass.states[i];if(!a)return;let{source:o,zone_id:s}=a.attributes,c=a.state;if(o!==`manual`){this.openProgramInfoDialog(n);return}this.openDurationDialog(n,c,r)})}),this.querySelectorAll(`.zone-delete`).forEach(e=>{e.addEventListener(`click`,e=>{let r=Number(e.currentTarget.dataset.zone),i=this._getZoneEntity(r),a=this._hass.states[i],o=a?.attributes?.zone?.name||a?.attributes?.zone_name||`Zone ${r}`;console.log(`openConfirmDialog:`,t),t({title:`Zone löschen`,text:`Zone wirklich löschen?`,entityName:o,confirmText:`Löschen`,danger:!0,parent:this,onConfirm:()=>{n(this,`sprinkler_ui_zone_delete`,{zone_id:r})}})})}),this.querySelectorAll(`.zone-edit`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.zone),n=this._getZoneEntity(t),r=this._hass.states[n];if(!r)return;let i=r.attributes.zone||{};this._workingZone={zone_id:i.zone_id??t,name:i.name??``,switch:i.switch??``,type:i.type??`lawn`,default_duration:Number(i.default_duration??600),load:Number(i.load??1),eto_factor:Number(i.eto_factor??1),rain_factor:Number(i.rain_factor??1),precipitation_rate_mm_per_hour:Number(i.precipitation_rate_mm_per_hour??10),enabled:i.enabled??!0},this._isNewZone=!1,this._view=`edit`,this.render()})}),this.querySelectorAll(`.zone-soil-reset`).forEach(e=>{e.addEventListener(`click`,e=>{let r=Number(e.currentTarget.dataset.zone);t({title:`Bodenbilanz zurücksetzen`,text:`Soll die Bodenfeuchte dieser Zone wirklich zurückgesetzt werden?`,confirmText:`Zurücksetzen`,danger:!1,parent:this,onConfirm:()=>{n(this,`sprinkler_ui_reset_soil`,{zone_id:r})}})})}),this.querySelectorAll(`.zone-action`).forEach(e=>{e.addEventListener(`click`,e=>{let r=e.currentTarget.closest(`.zone-row`),i=Number(r.dataset.zone),a=r.dataset.qe||null,o=this._getZoneEntity(i),s=this._hass.states[o]?.state;if(s===`running`||s===`queued`){let r=Number(e.currentTarget.dataset.zone),i=this._getZoneEntity(r),o=this._hass.states[i];t({title:`Zone stoppen`,text:`Möchtest du diese Zone wirklich stoppen?`,entityName:o?.attributes?.zone?.name||o?.attributes?.zone_name||`Zone ${r}`,confirmText:`Stoppen`,danger:!0,parent:this,onConfirm:()=>{this._activeDialog=null,n(this,`sprinkler_ui_cancel_zone`,{qe_id:a})}})}else n(this,`sprinkler_ui_start_zone`,{qe_id:a})})})}styles(){return`
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
          width: auto;
          flex-sshrink: 0;
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

          flex: 0 0 40px;
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
    `}},s=`sprinklerv2-zones-card`,c=class extends o{};customElements.get(s)||customElements.define(s,c);