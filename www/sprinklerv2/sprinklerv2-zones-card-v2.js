import{i as e,n as t,r as n,t as r}from"./sprinklerv2-utils.js";var i={lawn:`Rasen`,bed_sun:`Beet (volle Sonne)`,bed_dense:`Beet (dicht bewachsen)`,pot_outdoor:`Topf (Regen)`,pot_protected:`Topf (geschützt)`},a={lawn:{eto_factor:1,rain_factor:1},bed_sun:{eto_factor:.8,rain_factor:1},bed_dense:{eto_factor:.6,rain_factor:.6},pot_outdoor:{eto_factor:.5,rain_factor:.5},pot_protected:{eto_factor:.5,rain_factor:0}},o=class extends n{styles(){return`
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
        `}_getRenderState(e){return e.map(e=>{let t=e.attributes||{};return{id:t.zone_id,name:t.zone_name,enabled:t.enabled,state:e.state,soil:t.soil_mm,deficit:t.deficit_mm,deleted:t.deleted}})}getData(){if(!this._hass||!this._config?.entity)return[];let e=this._config.entity.replace(/_\d+$/,``);return Object.values(this._hass.states).filter(t=>t.entity_id.startsWith(e+`_`)).filter(e=>e.attributes?.zone_id!==void 0).filter(e=>!e.attributes.deleted).filter(e=>this._showDisabled||e.attributes.enabled===!0).sort((e,t)=>e.entity_id.localeCompare(t.entity_id))}_getZonePrefix(){return this._config?.entity?this._config.entity.replace(/_\d+$/,``):null}_getZoneConfig(e){return e?.attributes?.zone||{}}formatDuration(e){e=Number(e)||0;let t=Math.floor(e/3600),n=Math.floor(e%3600/60),r=e%60;return`${t.toString().padStart(2,`0`)}:${n.toString().padStart(2,`0`)}:${r.toString().padStart(2,`0`)}`}getDisplayedDuration(e){let t=e.attributes,n=t.zone_id,r=this._getZonePrefix();if(!r)return``;let i=`${r}_${String(n).padStart(2,`0`)}_remaining`,a=this._hass.states[i]?.state;if(a!=null&&a!==``)return this.formatDuration(a);let o=(t.zone||{}).default_duration||0;return this.formatDuration(o)}render(e){if(this._view===`edit`)return this.renderEditView();let t=r(this._hass),n=Array.isArray(e)?e:[];return`
            <div class="card-header">

                <div class="title">${this._config?.title||this._hass?.states[this._config.entity]?.attributes?.title||`Zonen`}</div>

                <div class="header-actions">

                    ${t?`<div class="show-disabled">
                        <ha-switch id="toggleDisabled" ${this._showDisabled?`checked`:``}></ha-switch>
                        <span>Disabled</span>
                    </div>
                    `:``}

                    ${t?`<div class="add-btn" id="addZoneBtn">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                    `:``}
                </div>

            </div>

            <div class="zones">
                ${n.map(e=>this.renderRow(e)).join(``)}
            </div>
        `}_updateRuntime(e){(Array.isArray(e)?e:[]).forEach(e=>{let t=e.attributes?.zone_id;if(t==null)return;let n=this.querySelector(`.zone-duration[data-zone="${t}"]`);if(!n)return;let r=this.getDisplayedDuration(e);n.textContent!==r&&(n.textContent=r);let i=this.querySelector(`.zone-action[data-zone="${t}"] ha-icon`);if(i){let t=e.state,n=t===`running`||t===`queued`||t===`enqueue`?`mdi:stop-circle-outline`:`mdi:play-circle-outline`,r=t===`running`?`#e53935`:t===`queued`?`#fb8c00`:`#9e9e9e`;i.setAttribute(`icon`,n),i.style.color=r}})}renderRow(e){let t=e.state,n=e.attributes,i=r(this._hass),a=this._getZoneConfig(e),o=n.zone_id,s=n.enabled,c=a.name||n.zone_name||`Zone ${o}`,l=s?``:`disabled`,u=t===`running`||t===`queued`||t===`enqueue`?`mdi:stop-circle-outline`:`mdi:play-circle-outline`,d=t===`running`?`#e53935`:t===`queued`?`#fb8c00`:`#9e9e9e`,f=this.getDisplayedDuration(e),p=n.soil_mm??null,m=n.deficit_mm??null,h=``;if(p!==null&&m!==null){let e=m===0?`#43a047`:m>5?`#fb8c00`:`#e53935`;h=`
            <div class="zone-soil">
                <ha-icon icon="mdi:water"></ha-icon>
                ${p.toFixed(1)}

                <ha-icon icon="mdi:water-minus" style="color:${e}"></ha-icon>
                ${m.toFixed(1)}
            </div>
            `}return`
            <div class="row ${l}" data-zone="${o}">

            <!-- LEFT -->
            <div class="zone-left">
                ${i?`
                <div class="icon-btn zone-delete" data-zone="${o}">
                <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                </div>
                `:``}
                ${i?`
                <div class="icon-btn zone-edit" data-zone="${o}">
                <ha-icon icon="mdi:cog-outline"></ha-icon>
                </div>
                `:``}
                ${i?`
                <div class="icon-btn zone-reset" data-zone="${o}">
                <ha-icon icon="mdi:water-sync"></ha-icon>
                </div>
                `:``}
            </div>

            <!-- CENTER -->
            <div class="center">
                <div class="name">${c}</div>
                <div class="sub">
                    Laufzeit:
                    <span class="zone-duration" data-zone="${o}">
                        ${f}
                    </span>
                </div>
                ${h}
            </div>

            <!-- RIGHT -->
            <div class="icon-btn zone-action" data-zone="${o}">
                <ha-icon icon="${u}" style="color:${d}"></ha-icon>
            </div>

            </div>
        `}attachEvents(){this.querySelectorAll(`.zone-action`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget.closest(`.row`),n=Number(t.dataset.zone);this._handleZoneAction(n)})}),this.querySelectorAll(`.center`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget.closest(`.row`),n=Number(t.dataset.zone);this._handleZoneCenterClick(n)})}),this.querySelectorAll(`.zone-delete`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.zone);this._handleDelete(t)})}),this.querySelectorAll(`.zone-reset`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.zone);this._handleReset(t)})}),this.querySelectorAll(`.zone-edit`).forEach(e=>{e.addEventListener(`click`,e=>{let t=Number(e.currentTarget.dataset.zone);this._handleEdit(t)})}),this.querySelector(`#toggleDisabled`)?.addEventListener(`change`,e=>{this._showDisabled=e.target.checked,this._renderInternal(this.getData())}),this.querySelector(`#addZoneBtn`)?.addEventListener(`click`,()=>{this._workingZone={name:``,switch:``,type:`lawn`,default_duration:600,load:1,eto_factor:1,rain_factor:1,precipitation_rate_mm_per_hour:10,enabled:!0},this._isNewZone=!0,this._view=`edit`,this._renderInternal(this.getData())})}_rowSelect(e,t,n,r){return`
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
        `}_rowStepper(e,t,n,r,i){return`
        <div class="detail-row stepper-row">

            <div class="label">${e}</div>

            <div class="stepper">
            <div class="step-btn" id="${t}_minus">−</div>
            <div class="step-value" id="${t}_val">${n}</div>
            <div class="step-btn" id="${t}_plus">+</div>
            </div>

        </div>
        `}renderEditView(){let e=this._workingZone;if(!e)return`<div>No zone</div>`;let t=Object.values(this._hass.states).filter(e=>e.entity_id.startsWith(`switch.`)).sort((e,t)=>e.entity_id.localeCompare(t.entity_id)),n=Number(this._hass.states[`input_number.sprinkler_capacity`]?.state)||1,r=a[e.type]||{},o=e.eto_factor!==r.eto_factor||e.rain_factor!==r.rain_factor?`Typ (angepasst)`:`Typ`;return`
            <div class="edit">

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

                ${this._rowSelect(`Switch`,`switchInput`,t.map(e=>({value:e.entity_id,label:e.entity_id})),e.switch)}

                ${this._rowSelect(o,`typeInput`,Object.entries(i).map(([e,t])=>({value:e,label:t})),e.type||`lawn`)}

                <div class="divider"></div>

                ${this._rowSliderCompact(`Laufzeit`,`durationInput`,Math.floor((e.default_duration||600)/60),1,240,`min`)}

                ${this._rowSliderCompact(`Precipitation`,`precipInput`,e.precipitation_rate_mm_per_hour||10,1,30,`mm/h`)}

                <div class="divider"></div>

                ${this._rowStepper(`Load`,`loadInput`,e.load||1,1,n)}

                ${this._rowSliderCompact(`ETo Factor`,`etoInput`,e.eto_factor??1,.1,2,``,.1)}

                ${this._rowSliderCompact(`Rain Factor`,`rainInput`,e.rain_factor??1,0,1,``,.1)}

                </div>
            </div>

            </div>
        `}_attachEditEvents(){let t=this._workingZone;this.querySelector(`#backBtn`)?.addEventListener(`click`,()=>{this._view=`list`,this._workingZone=null,this._renderInternal(this.getData())}),this.querySelector(`#saveBtn`)?.addEventListener(`click`,()=>{t.name=this.querySelector(`#zoneNameInput`).value,t.switch=this.querySelector(`#switchInput`).value,t.default_duration=Number(this.querySelector(`#durationInput`).value)*60,t.precipitation_rate_mm_per_hour=Number(this.querySelector(`#precipInput`).value),t.eto_factor=Number(this.querySelector(`#etoInput`).value),t.rain_factor=Number(this.querySelector(`#rainInput`).value),t.enabled=this.querySelector(`#enabledInput`).checked;let n=this._isNewZone?`sprinkler_ui_zone_add`:`sprinkler_ui_zone_update`;e(this,n,{zone:t}),this._isNewZone=!1,this._view=`list`,this._workingZone=null,this._renderInternal(this.getData())});let n=this.querySelector(`#zoneNameDisplay`),r=this.querySelector(`#zoneNameInput`);if(n&&r){n.addEventListener(`click`,()=>{n.style.display=`none`,r.style.display=`inline-block`,r.focus(),r.select()});let e=()=>{let e=r.value.trim()||`Neue Zone`;this._workingZone.name=e,n.innerText=e,r.style.display=`none`,n.style.display=`inline-block`};r.addEventListener(`keydown`,t=>{t.key===`Enter`&&e()}),r.addEventListener(`blur`,e)}[`durationInput`,`precipInput`,`factorInput`,`rainInput`].forEach(e=>{let t=this.querySelector(`#${e}`),n=this.querySelector(`#${e}_val`);t?.addEventListener(`input`,e=>{n&&(n.innerText=e.target.value)})});let i=this.querySelector(`#loadInput_val`);this.querySelector(`#loadInput_minus`)?.addEventListener(`click`,()=>{let e=Number(i.innerText);e>1&&(i.innerText=e-1)}),this.querySelector(`#loadInput_plus`)?.addEventListener(`click`,()=>{let e=Number(i.innerText);e<(Number(this._hass.states[`input_number.sprinkler_capacity`]?.state)||1)&&(i.innerText=e+1)})}_getZoneEntity(e){let t=this._getZonePrefix();return t?`${t}_${String(e).padStart(2,`0`)}`:null}_handleZoneAction(t){let n=this._getZoneEntity(t);if(!n)return;let r=this._hass.states[n];if(!r)return;let i=r.state,a=r.attributes.qe_id;if(i===`running`||i===`queued`){e(this,`sprinkler_ui_cancel_zone`,{qe_id:a});return}e(this,`sprinkler_ui_start_zone`,{qe_id:a})}_handleZoneCenterClick(e){let t=this._getZoneEntity(e);if(!t)return;let n=this._hass.states[t];if(!n)return;let{source:r}=n.attributes,i=n.state,a=n.attributes.qe_id;if(r!==`manual`){this.openProgramInfoDialog?.(e);return}this.openDurationDialog(e,i,a)}_closeActiveDialog(){this._activeDialog&&(this._activeDialog.open=!1,setTimeout(()=>{this._activeDialog?.remove(),this._activeDialog=null},150))}openDurationDialog(t,n,r){this._closeActiveDialog();let i=document.createElement(`ha-dialog`);this.appendChild(i),setTimeout(()=>{i.open=!0},0);let a=this._getZoneEntity(t);if(!a)return;let o=this._hass.states[a];if(!o)return;let s=this._getZoneConfig(o),c=Number(s.default_duration)||600,l=`${a}_remaining`,u=this._hass.states[l]?.state,d=Number(u),f=Math.max(1,Math.floor(n===`running`?(Number.isFinite(d)&&d>0?d:c)/60:c/60)),p=n===`running`,m=n===`queued`,h=p?`Restlaufzeit einstellen`:`Laufzeit einstellen`,g=p?`Setzen`:m?`Übernehmen`:`Start`;i.innerHTML=`
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
            ${h}
            </div>

            <div class="dialog-body">
            <div id="value" class="value-display">
                ${f} min
            </div>

            <div class="slider-row">
                <div id="minus" class="step-btn">−</div>

                <ha-slider
                id="slider"
                min="1"
                max="120"
                step="1"
                value="${f}"
                pin
                ></ha-slider>

                <div id="plus" class="step-btn">+</div>
            </div>
            </div>

            <div class="actions">
            <div id="cancelBtn" class="action-btn cancel-btn">
                Abbrechen
            </div>

            ${p?`
                    <div id="stopBtn" class="action-btn cancel-btn">
                    Stoppen
                    </div>
                    <div id="extendBtn" class="action-btn start-btn">
                    ${g}
                    </div>
                `:`
                    <div id="startBtn" class="action-btn start-btn">
                    ${g}
                    </div>
                `}
            </div>
        </div>
        `;let _=i.querySelector(`#slider`),v=i.querySelector(`#value`),y=i.querySelector(`#minus`),b=i.querySelector(`#plus`),x=Number(_.min),S=Number(_.max);function C(){v.textContent=`${f} min`,_.value=f}let w;b.addEventListener(`mousedown`,()=>{w=setInterval(()=>{f<S&&(f++,C())},150)}),[`mouseup`,`mouseleave`].forEach(e=>b.addEventListener(e,()=>clearInterval(w))),y.addEventListener(`mousedown`,()=>{w=setInterval(()=>{f>x&&(f--,C())},150)}),[`mouseup`,`mouseleave`].forEach(e=>y.addEventListener(e,()=>clearInterval(w))),y?.addEventListener(`click`,()=>{f>x&&(f--,C())}),b?.addEventListener(`click`,()=>{f<S&&(f++,C())}),_.addEventListener(`input`,e=>{f=Number(e.target.value),C()}),i.querySelector(`#cancelBtn`).addEventListener(`click`,()=>{i.open=!1}),p?(i.querySelector(`#stopBtn`).addEventListener(`click`,()=>{this._activeDialog=i,e(this,`sprinkler_ui_cancel_zone`,{qe_id:r})}),i.querySelector(`#extendBtn`).addEventListener(`click`,()=>{this._activeDialog=i,e(this,`sprinkler_ui_extend_zone`,{qe_id:r,duration:f*60})})):i.querySelector(`#startBtn`).addEventListener(`click`,()=>{let t=m?`sprinkler_ui_extend_zone`:`sprinkler_ui_start_zone`;this._activeDialog=i,e(this,t,{qe_id:r,duration:f*60})}),i.addEventListener(`transitionend`,()=>{i.open||i.remove()})}_handleDelete(n){let r=this._getZoneEntity(n),i=this._hass.states[r];t({title:`Zone löschen`,text:`Zone wirklich löschen?`,entityName:i?.attributes?.zone?.name||i?.attributes?.zone_name||`Zone ${n}`,confirmText:`Löschen`,danger:!0,parent:this,onConfirm:()=>{e(this,`sprinkler_ui_zone_delete`,{zone_id:n})}})}_handleReset(n){t({title:`Bodenbilanz zurücksetzen`,text:`Soll die Bodenfeuchte dieser Zone zurückgesetzt werden?`,confirmText:`Zurücksetzen`,danger:!1,parent:this,onConfirm:()=>{e(this,`sprinkler_ui_reset_soil`,{zone_id:n})}})}_handleEdit(e){let t=this._getZoneEntity(e),n=this._hass.states[t];if(!n)return;let r=n.attributes,i=this._getZoneConfig(n);this._workingZone={zone_id:r.zone_id,name:i.name??``,switch:i.switch??``,type:i.type??`lawn`,default_duration:Number(i.default_duration??600),load:Number(i.load??1),eto_factor:Number(i.eto_factor??1),rain_factor:Number(i.rain_factor??1),precipitation_rate_mm_per_hour:Number(i.precipitation_rate_mm_per_hour??10),enabled:r.enabled??!0},this._view=`edit`,this._renderInternal(this.getData())}};customElements.define(`sprinklerv2-zones-card-v2`,o);