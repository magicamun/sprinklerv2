console.log(`eto-card loaded`);var e=class extends HTMLElement{setConfig(e){if(!e.entity)throw Error(`ETo entity required`);this.config=e}_getIcon(e){switch(e){case`high`:return`mdi:water-alert`;case`medium`:return`mdi:water`;default:return`mdi:water-off`}}set hass(e){this._hass=e;let t=this.config.entity,n=e.states[t];if(!n)return;let r=Number(n.state)||0,i=n.attributes.explanation||{},a=i.label||`–`,o=i.level||`low`,s=i.factors||[],c=this._getIcon(o);this.innerHTML=`
      <ha-card>
        ${this._styles()}

        <div class="card">

          <div class="header">
            <div class="title-row">
                <ha-icon icon="${c}" class="eto-icon ${o}"></ha-icon>
                <div class="title">
                ${this.config.title||`ETo`}
                </div>
            </div>

            <div class="value">
              ${r.toFixed(2)} mm
            </div>
          </div>

          <div class="label ${o}">
            ${a}
          </div>

          <div class="factors">
            ${s.map(e=>`<div class="factor">• ${e}</div>`).join(``)}
          </div>

        </div>
      </ha-card>
    `}_styles(){return`
      <style>
        .card {
          padding: 12px 14px;
        }

        .header {
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom: 8px;
        }

        .title {
          font-size: 14px;
          opacity: 0.7;
        }

        .value {
          font-size: 16px;
          font-weight: 600;
        }

        .label {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .label.low {
          color: #4CAF50;
        }

        .label.medium {
          color: #FB8C00;
        }

        .label.high {
          color: #E53935;
        }

        .factors {
          display:flex;
          flex-direction:column;
          gap: 2px;
          font-size: 13px;
          opacity: 0.75;
        }

        .factor {
          line-height: 1.4;
        }

        .title-row {
          display:flex;
          align-items:center;
          gap:6px;
        }

        .eto-icon {
          --mdc-icon-size: 18px;
          opacity: 0.85;
        }

        .eto-icon.low {
          color: #4CAF50;
        }

        .eto-icon.medium {
          color: #FB8C00;
        }

        .eto-icon.high {
          color: #E53935;
        }
      </style>
    `}getCardSize(){return 2}},t=`sprinklerv2-eto-card`;customElements.get(t)||customElements.define(t,e);