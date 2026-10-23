// WISER 2.6 Standalone Offline & Static Client Engine
// Intercepts /api/* calls when running on static hosting (GitHub Pages) or when offline in dead-cell zones,
// fulfilling every endpoint locally from offline_db.json + live Open-Meteo CORS weather API.
(function() {
  const CORRIDOR_COORDS = {
    "pueblo, co": [38.2544, -104.6091, "Pueblo, CO (I-25 / US-50 Junction)"],
    "pueblo west, co": [38.3500, -104.7228, "Pueblo West, CO (US-50 Corridor)"],
    "colorado springs, co": [38.8339, -104.8214, "Colorado Springs, CO (I-25 / US-24)"],
    "fountain, co": [38.6822, -104.7008, "Fountain, CO (I-25 Rail/Truck Corridor)"],
    "canon city, co": [38.4410, -105.2424, "Cañon City, CO (US-50 Arkansas River Gorge)"],
    "cañon city, co": [38.4410, -105.2424, "Cañon City, CO (US-50 Arkansas River Gorge)"],
    "monument, co": [39.0917, -104.8728, "Monument, CO (Palmer Divide I-25)"],
    "castle rock, co": [39.3722, -104.8561, "Castle Rock, CO (I-25 Corridor)"],
    "walsenburg, co": [37.6242, -104.7803, "Walsenburg, CO (I-25 / US-160)"],
    "trinidad, co": [37.1695, -104.5005, "Trinidad, CO (Raton Pass I-25)"],
    "la junta, co": [37.9850, -103.5438, "La Junta, CO (US-50 / BNSF Rail Yard)"],
    "salida, co": [38.5347, -105.9989, "Salida, CO (US-50 / US-285)"]
  };
  const COMPASS_16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  function degToCard(d) {
    return COMPASS_16[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
  }

  let dbPromise = null;
  function getBasePrefix() {
    const p = window.location.pathname;
    if (p.includes('/wiser-sentinel-site')) return '/wiser-sentinel-site';
    return '';
  }

  async function loadLocalDb() {
    if (window.__WISER_OFFLINE_DB) return window.__WISER_OFFLINE_DB;
    if (!dbPromise) {
      const prefix = getBasePrefix();
      const candidates = [
        `${prefix}/static/offline_db.json`,
        './static/offline_db.json',
        '../static/offline_db.json',
        '/static/offline_db.json'
      ];
      dbPromise = (async () => {
        for (const url of candidates) {
          try {
            const r = await window.__origFetch(url);
            if (r && r.ok) {
              const data = await r.json();
              window.__WISER_OFFLINE_DB = data;
              return data;
            }
          } catch (e) {}
        }
        throw new Error('Could not load offline_db.json');
      })();
    }
    return dbPromise;
  }

  function classifyCameoGroups(chem) {
    const groups = new Set();
    const name = (chem.name || '').toLowerCase();
    const syn = (chem.synonyms || '').toLowerCase();
    const sclass = (chem.storage_class || '').toLowerCase();
    const hclass = (chem.hazard_class || '').toLowerCase();
    const react = (chem.reactivity || '').toLowerCase();
    const blob = `${name} ${syn} ${sclass} ${hclass}`;

    if (blob.includes('hypochlorite') || blob.includes('bleach') || blob.includes('pool shock')) {
      ['hypochlorite', 'oxidizer', 'base', 'aqueous'].forEach(g => groups.add(g));
    }
    if (blob.includes('ammonia') || blob.includes('ammonium hydroxide') || blob.includes('urea') || blob.includes('amine')) {
      ['ammonia', 'base', 'amine'].forEach(g => groups.add(g));
    }
    if (blob.includes('cyanide') || blob.includes('acrylonitrile') || blob.includes('acetonitrile') || blob.includes('prussic')) groups.add('cyanide');
    if (blob.includes('sulfide') || blob.includes('hydrosulfide')) groups.add('sulfide');
    if (blob.includes('nitric acid')) ['nitric_acid', 'acid', 'oxidizer'].forEach(g => groups.add(g));
    if (blob.includes('hydrofluoric') || blob.includes('hydrogen fluoride') || blob.includes('boron trifluoride')) ['hydrofluoric_acid', 'acid'].forEach(g => groups.add(g));
    if (blob.includes('acid') || sclass.includes('corrosive acid') || blob.includes('ferric chloride') || blob.includes('phosphorus trichloride')) groups.add('acid');
    if (blob.includes('hydroxide') || blob.includes('caustic') || sclass.includes('corrosive base') || blob.includes('methoxide')) groups.add('base');
    if (chem.water_reactive === 1 || sclass.includes('water-reactive') || hclass.includes('4.3')) groups.add('water_reactive');
    if (name.includes('sodium') && name.includes('metallic')) ['alkali_metal', 'water_reactive'].forEach(g => groups.add(g));
    if (blob.includes('peroxide')) ['peroxide', 'oxidizer'].forEach(g => groups.add(g));
    if (sclass.includes('oxidizer') || hclass.includes('5.1') || hclass.includes('5.2') || blob.includes('chlorate') || name.includes('oxygen')) groups.add('oxidizer');
    if (sclass.includes('flammable') || hclass.includes('flammable') || hclass.includes('combustible') || (chem.nfpa_flammability || 0) >= 2) {
      ['flammable', 'organic'].forEach(g => groups.add(g));
    }
    if (['acetone','toluene','xylene','benzene','gasoline','diesel','ethanol','methanol','isopropyl','glycol','brake fluid','jet a','asphalt','styrene','phenol'].some(k => blob.includes(k))) groups.add('organic');
    if (['tetrachloroethylene','chloroform','dichloromethane','methylene chloride','chlorinated','trichloroethylene'].some(k => blob.includes(k))) {
      ['chlorinated_solvent', 'halogen'].forEach(g => groups.add(g));
    }
    if (['chlorine','bromine','fluorine','methyl bromide'].some(k => blob.includes(k))) groups.add('halogen');
    if (blob.includes('lithium-ion') || blob.includes('lithium')) ['lithium_battery', 'water_reactive'].forEach(g => groups.add(g));
    if (blob.includes('acetylene') || blob.includes('calcium carbide')) groups.add('acetylene');
    if (blob.includes('ammonium nitrate')) ['ammonium_nitrate', 'oxidizer', 'ammonia'].forEach(g => groups.add(g));
    if (blob.includes('ethylene oxide')) ['ethylene_oxide', 'flammable'].forEach(g => groups.add(g));
    if (['solution','aqueous','fluid','bleach','acid','wash','antifreeze'].some(k => blob.includes(k))) groups.add('aqueous');
    if (blob.includes('ferric') || react.includes('copper') || blob.includes('metal')) groups.add('metal_salt');
    return Array.from(groups).sort();
  }

  function buildSdsPayload(db, chemId) {
    const chem = db.chemicals.find(c => c.id === Number(chemId)) || db.chemicals[0];
    const picKey = 'ghs_' + 'pictograms';
    const codes = (chem[picKey] || '').split(',').map(s => s.trim()).filter(Boolean);
    chem.pictogram_details = (db.pictograms || []).filter(p => codes.includes(p.id));
    chem.cameo_groups = classifyCameoGroups(chem);
    const fp = chem.flash_point_c !== null && chem.flash_point_c !== undefined ? `${chem.flash_point_c} °C` : 'Non-Flammable / Not Applicable';
    const bp = chem.boiling_point_c !== null && chem.boiling_point_c !== undefined ? `${chem.boiling_point_c} °C` : 'Decomposes / Solid';

    const sds_sections = [
      {section: 1, title: "Identification", content: `Product Name: ${chem.name}\nSynonyms: ${chem.synonyms}\nUN/NA Number: UN${chem.un_number}\nCAS Number: ${chem.cas_number}\nCategory: ${chem.category}\nRecommended Use / Context: ${chem.sds_key_points}`},
      {section: 2, title: "Hazard(s) Identification", content: `GHS Signal Word: ${chem.ghs_signal_word}\nDOT / GHS Classification: ${chem.hazard_class}\nNFPA 704 Diamond: Health=${chem.nfpa_health}, Flammability=${chem.nfpa_flammability}, Instability=${chem.nfpa_instability}, Special=${chem.nfpa_special || 'None'}\nPictograms: ${chem[picKey] || ''}`},
      {section: 3, title: "Composition / Information on Ingredients", content: `Primary Hazardous Component: ${chem.name}\nCAS Registry Number: ${chem.cas_number}\nSynonyms / Trade Formulations: ${chem.synonyms}`},
      {section: 4, title: "First-Aid Measures", content: `Acute Clinical Signs & Symptoms: ${chem.symptoms}\nEmergency First-Aid Protocol: ${chem.first_aid}\nSpecific Medical Antidote / Countermeasure: ${chem.antidote}`},
      {section: 5, title: "Fire-Fighting Measures", content: `Flash Point: ${fp}\nERG Guide Number: Guide ${chem.erg_guide}\nWater Reactive: ${chem.water_reactive ? 'YES - DO NOT USE WATER DIRECTLY' : 'No (Water fog/spray permissible per guide)'}\nFire Suppression & Tactical Response: ${chem.fire_response}`},
      {section: 6, title: "Accidental Release Measures", content: `Initial Isolation (Small Spill - Day): ${chem.iso_small_day_m} meters (${Math.round(chem.iso_small_day_m*3.28084)} ft) | Downwind: ${chem.iso_small_day_km} km\nLarge Spill / Nighttime Isolation: ${chem.iso_large_night_m} meters (${Math.round(chem.iso_large_night_m*3.28084)} ft) | Downwind: ${chem.iso_large_night_km} km\nRequired Responder PPE: ${chem.ppe_level}`},
      {section: 7, title: "Handling and Storage", content: `Storage Segregation Class: ${chem.storage_class}\nRequired Storage Conditions & Temperature: ${chem.storage_temp}\nStrict Storage Incompatibilities: ${chem.storage_incompatibilities}`},
      {section: 8, title: "Exposure Controls / Personal Protection", content: `OSHA PEL: ${chem.osha_pel}\nNIOSH REL: ${chem.niosh_rel}\nIDLH: ${chem.idlh_level}\nRespiratory Protection: ${chem.respirator_req}\nProtective Apparel: ${chem.ppe_level}`},
      {section: 9, title: "Physical and Chemical Properties", content: `Physical State: ${chem.physical_state}\nAppearance / Color: ${chem.color}\nOdor Profile: ${chem.odor}\nBoiling Point: ${bp}\nFlash Point: ${fp}\nRelative Density (Water=1): ${chem.relative_density}\nVapor Density (Air=1): ${chem.vapor_density || 'N/A'}`},
      {section: 10, title: "Stability and Reactivity", content: `NFPA Instability Rating: ${chem.nfpa_instability}\nWater Reactivity: ${chem.water_reactive ? 'VIOLENT / HAZARDOUS' : 'Stable in water'}\nChemical Incompatibilities: ${chem.reactivity}\nCAMEO Groups: ${chem.cameo_groups.join(', ')}`},
      {section: 11, title: "Toxicological Information", content: `Acute Target Organ & Clinical Effects: ${chem.symptoms}\nIDLH Concentration: ${chem.idlh_level}\nAntidotal Therapy: ${chem.antidote}`},
      {section: 12, title: "Ecological Information", content: "Prevent runoff from entering storm drains, basements, waterways, or drinking water intakes. Dike fire-control water for proper hazardous waste disposal."},
      {section: 13, title: "Disposal Considerations", content: `Dispose of as RCRA Hazardous Waste in accordance with EPA 40 CFR 261. Do not flush ${chem.storage_class} materials to sanitary sewer.`},
      {section: 14, title: "Transport Information", content: `UN/DOT Number: UN${chem.un_number}\nDOT Hazard Class: ${chem.hazard_class}\nERG 2024 Guide #${chem.erg_guide}`},
      {section: 15, title: "Regulatory Information", content: `OSHA HazCom 2012 (29 CFR 1910.1200): ${chem.ghs_signal_word}\nSARA Title III / EPCRA Tier II Reportable.\nStorage Class: ${chem.storage_class}`},
      {section: 16, title: "Other Information & Field Summary", content: `Operational Summary: ${chem.sds_key_points}\nGenerated by WISER Reborn 2.6: Ultimate HazMat & SDS Sentinel.`}
    ];
    return {chemical: chem, sds_sections};
  }

  function evaluateReactivityLocal(db, id1, id2) {
    const c1 = db.chemicals.find(c => c.id === Number(id1)) || db.chemicals[0];
    const c2 = db.chemicals.find(c => c.id === Number(id2)) || db.chemicals[1];
    const g1 = classifyCameoGroups(c1);
    const g2 = classifyCameoGroups(c2);
    const warnings = [];
    const gases = [];
    let danger_level = "LOW / COMPATIBLE";
    let min_iso_m = Math.max(Number(c1.iso_small_day_m || 25), Number(c2.iso_small_day_m || 25));

    for (const r of (db.reactivity_rules || [])) {
      if ((g1.includes(r.group_a) && g2.includes(r.group_b)) || (g1.includes(r.group_b) && g2.includes(r.group_a))) {
        warnings.push(r.consequence);
        if (r.gas_generated && !gases.includes(r.gas_generated)) gases.push(r.gas_generated);
        danger_level = r.danger_level;
        min_iso_m = Math.max(min_iso_m, Number(r.min_isolation_m || 100));
      }
    }
    const pair = `${c1.name.toLowerCase()} | ${c2.name.toLowerCase()}`;
    if ((pair.includes('hypochlorite') || pair.includes('bleach')) && (pair.includes('brake fluid') || pair.includes('ethylene glycol') || pair.includes('antifreeze'))) {
      danger_level = "SPONTANEOUS FIREBALL & CL2 GAS";
      gases.push("Chlorine Gas & Intense Thermal Fireball");
      warnings.push("EXTREME HYPERGOLIC DELAYED IGNITION: Polyglycol brake fluid or ethylene glycol mixed with hypochlorite pool shock erupts into a violent 2,000°F fireball after a 15-45 second induction delay!");
      min_iso_m = Math.max(min_iso_m, 250);
    }
    if (!warnings.length) {
      warnings.push("No catastrophic binary gas/explosion synergy triggered in CAMEO matrix, but always review individual Section 10 SDS reactivity notes.");
    }
    return {
      chemical_1: c1.name,
      chemical_2: c2.name,
      cameo_groups_1: g1,
      cameo_groups_2: g2,
      danger_level,
      gases_generated: gases,
      min_isolation_m: min_iso_m,
      consequences: warnings
    };
  }

  async function computePlumeLocal(db, params) {
    const chemId = Number(params.get('chem_id') || 10);
    const chem = db.chemicals.find(c => c.id === chemId) || db.chemicals[0];
    const locRaw = (params.get('location') || 'Pueblo, CO').trim();
    const locCoords = CORRIDOR_COORDS[locRaw.toLowerCase()] || [38.2544, -104.6091, locRaw];
    const [lat, lon, loc_label] = locCoords;

    let w_from = params.get('wind_dir_deg') !== null ? Number(params.get('wind_dir_deg')) : 270.0;
    let w_mph = params.get('wind_speed_mph') !== null ? Number(params.get('wind_speed_mph')) : 12.0;
    let time_of_day = (params.get('time_of_day') || 'night').toLowerCase();
    const spill_size = (params.get('spill_size') || 'large').toLowerCase();
    const use_live = params.get('use_live_weather') === 'true';
    let weather_source = 'standalone_pwa_engine';

    if (use_live) {
      try {
        const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,is_day&wind_speed_unit=mph`;
        const mr = await window.__origFetch(meteoUrl);
        if (mr.ok) {
          const md = await mr.json();
          if (md.current) {
            w_from = Number(md.current.wind_direction_10m ?? w_from);
            w_mph = Number(md.current.wind_speed_10m ?? w_mph);
            weather_source = 'open_meteo_live';
          }
        }
      } catch (e) {
        weather_source = 'offline_manual_fallback';
      }
    }

    const isLarge = spill_size.startsWith('l');
    const isNight = time_of_day.startsWith('n');
    const small_m = Number(chem.iso_small_day_m || 30);
    const large_m = Number(chem.iso_large_night_m || Math.max(small_m * 2, 100));
    const small_km = Number(chem.iso_small_day_km || 0.1);
    const large_km = Number(chem.iso_large_night_km || Math.max(small_km * 3, 0.3));

    let iso_m = small_m;
    let pad_km = Math.max(small_km, +(small_m / 1000).toFixed(2));
    if (!isLarge && isNight) {
      iso_m = small_m;
      pad_km = Math.max(+((small_km + large_km) * 0.45).toFixed(2), +((small_m * 1.5) / 1000).toFixed(2));
    } else if (isLarge && !isNight) {
      iso_m = Math.round((small_m + large_m) * 0.65);
      pad_km = Math.max(+(large_km * 0.6).toFixed(2), +((iso_m * 1.5) / 1000).toFixed(2));
    } else if (isLarge && isNight) {
      iso_m = large_m;
      pad_km = Math.max(large_km, +((large_m * 1.5) / 1000).toFixed(2));
    }

    const down_deg = +((w_from + 180) % 360).toFixed(1);
    const stage_deg = +(w_from % 360).toFixed(1);
    const cone_half = w_mph < 8 ? 22 : (w_mph < 18 ? 16 : 12);

    return {
      chemical_id: chem.id,
      chemical_name: chem.name,
      un_number: chem.un_number,
      erg_guide: chem.erg_guide,
      spill_size: isLarge ? 'large' : 'small',
      time_of_day: isNight ? 'night' : 'day',
      location_label,
      coordinates: {lat, lon},
      weather_source,
      wind_from_deg: +w_from.toFixed(1),
      wind_from_cardinal: degToCard(w_from),
      wind_speed_mph: +w_mph.toFixed(1),
      downwind_bearing_deg: down_deg,
      downwind_cardinal: degToCard(down_deg),
      recommended_staging_bearing_deg: stage_deg,
      recommended_staging_cardinal: degToCard(stage_deg),
      initial_isolation_m: iso_m,
      initial_isolation_ft: Math.round(iso_m * 3.28084),
      downwind_pad_km: pad_km,
      downwind_pad_mi: +(pad_km * 0.621371).toFixed(2),
      cone_half_angle_deg: cone_half,
      vapor_density: chem.vapor_density,
      vapor_behavior: (chem.vapor_density || 0) > 1.05 ? 'HEAVIER THAN AIR — Vapor hugs low ground, utility trenches, storm sewers, and creek beds' : 'Buoyant / Neutral vapor dispersion',
      water_reactive: !!chem.water_reactive,
      tactical_directive: `Stage apparatus UPWIND at ${stage_deg}° (${degToCard(stage_deg)}). Establish ${iso_m}m (${Math.round(iso_m*3.28084)} ft) 360° Hot Zone. Evacuate/Shelter-in-Place ${pad_km} km (${+(pad_km*0.621371).toFixed(2)} mi) DOWNWIND toward ${down_deg}° (${degToCard(down_deg)}).`
    };
  }

  async function handleLocalApi(urlStr) {
    const db = await loadLocalDb();
    const u = new URL(urlStr, window.location.origin);
    const path = u.pathname.replace(/^\/wiser-sentinel-site/, '');
    const params = u.searchParams;

    if (path === '/api/health') {
      return {
        status: "ONLINE (STANDALONE PWA)",
        engine: db.engine,
        version: db.version,
        chemicals_count: db.chemicals.length,
        storage_rules_count: db.storage_rules.length,
        cameo_reactivity_rules_count: (db.reactivity_rules || []).length,
        offline_pwa_ready: true
      };
    }
    if (path === '/api/search') {
      const q = (params.get('q') || '').trim().toLowerCase();
      const cat = params.get('category') || 'ALL';
      const unCand = q.replace(/^un|^na/i, '').trim();
      let rows = db.chemicals.filter(c => {
        if (cat !== 'ALL' && c.category !== cat) return false;
        if (!q) return true;
        return (
          (c.un_number || '').toLowerCase().includes(unCand) ||
          (c.name || '').toLowerCase().includes(q) ||
          (c.synonyms || '').toLowerCase().includes(q) ||
          (c.cas_number || '').toLowerCase().includes(q) ||
          (c.hazard_class || '').toLowerCase().includes(q) ||
          (c.storage_class || '').toLowerCase().includes(q)
        );
      });
      return {count: rows.length, results: rows};
    }
    if (path.startsWith('/api/chemical/')) {
      const id = Number(path.split('/').pop());
      return buildSdsPayload(db, id).chemical;
    }
    if (path.startsWith('/api/sds/')) {
      const id = Number(path.split('/').pop());
      return buildSdsPayload(db, id);
    }
    if (path === '/api/plume') {
      return await computePlumeLocal(db, params);
    }
    if (path.startsWith('/api/ics208/')) {
      const id = Number(path.split('/').pop());
      const chem = buildSdsPayload(db, id).chemical;
      params.set('chem_id', String(id));
      const plume = await computePlumeLocal(db, params);
      return {
        form: "FEMA ICS-208 HM (Site Safety and Control Plan)",
        generated_utc: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        incident_name: params.get('incident_name') || 'I-25 / US-50 Corridor HazMat Response',
        location: plume.location_label,
        chemical: {
          id: chem.id,
          name: chem.name,
          un_number: `UN${chem.un_number}`,
          cas_number: chem.cas_number,
          erg_guide: chem.erg_guide,
          hazard_class: chem.hazard_class
        },
        control_zones: {
          hot_zone_exclusion_radius_m: plume.initial_isolation_m,
          hot_zone_exclusion_radius_ft: plume.initial_isolation_ft,
          warm_zone_decon_corridor: `Upwind sector at ${plume.recommended_staging_bearing_deg}° (${plume.recommended_staging_cardinal}) — minimum 50m outside Hot Zone boundary`,
          downwind_protective_action_km: plume.downwind_pad_km,
          downwind_protective_action_mi: plume.downwind_pad_mi,
          downwind_plume_bearing_deg: plume.downwind_bearing_deg,
          downwind_plume_cardinal: plume.downwind_cardinal,
          apparatus_staging_vector: `${plume.recommended_staging_bearing_deg}° (${plume.recommended_staging_cardinal}) Upwind / Uphill`
        },
        ppe_and_respiratory: {
          entry_team_ppe: chem.ppe_level,
          decon_team_ppe: "One level below Entry Team (minimum Level B splash + SCBA for TIH/corrosives)",
          respirator_requirement: chem.respirator_req,
          osha_pel: chem.osha_pel,
          niosh_rel: chem.niosh_rel,
          idlh: chem.idlh_level
        },
        decon_and_medical: {
          water_reactive_warning: chem.water_reactive ? "CRITICAL: SUBSTANCE IS WATER-REACTIVE — Dry blot / brush before water decon!" : "Standard high-volume water/soap technical decon corridor.",
          symptoms_to_monitor: chem.symptoms,
          first_aid_protocol: chem.first_aid,
          specific_antidote: chem.antidote,
          fire_suppression: chem.fire_response
        }
      };
    }
    if (path === '/api/identify') {
      const odor = (params.get('odor') || '').toLowerCase();
      const color = (params.get('color') || '').toLowerCase();
      const symptom = (params.get('symptom') || '').toLowerCase();
      const state = (params.get('state') || '').toLowerCase();
      const scored = [];
      for (const c of db.chemicals) {
        let score = 0;
        const matches = [];
        if (odor && (c.odor || '').toLowerCase().includes(odor)) { score += 35; matches.push(`Odor match: '${odor}'`); }
        if (color && (c.color || '').toLowerCase().includes(color)) { score += 25; matches.push(`Color match: '${color}'`); }
        if (symptom && (c.symptoms || '').toLowerCase().includes(symptom)) { score += 40; matches.push(`Symptom match: '${symptom}'`); }
        if (state && (c.physical_state || '').toLowerCase().includes(state)) { score += 15; matches.push(`State match: '${state}'`); }
        if (score > 0) {
          scored.push(Object.assign({}, c, {confidence_score: Math.min(score, 100), match_reasons: matches}));
        }
      }
      scored.sort((a, b) => b.confidence_score - a.confidence_score);
      return {count: scored.length, candidates: scored};
    }
    if (path === '/api/storage/rules') {
      return {rules: db.storage_rules};
    }
    if (path === '/api/storage/check') {
      const c1 = db.chemicals.find(c => c.id === Number(params.get('id1'))) || db.chemicals[0];
      const c2 = db.chemicals.find(c => c.id === Number(params.get('id2'))) || db.chemicals[1];
      const rule = db.storage_rules.find(r =>
        (r.class_a === c1.storage_class && r.class_b === c2.storage_class) ||
        (r.class_a === c2.storage_class && r.class_b === c1.storage_class)
      );
      if (rule) {
        return {
          chem1: c1.name, chem2: c2.name,
          class1: c1.storage_class, class2: c2.storage_class,
          status: rule.compatibility, reason: rule.reason, action_required: rule.action_required
        };
      }
      if (c1.storage_class === c2.storage_class) {
        return {
          chem1: c1.name, chem2: c2.name,
          class1: c1.storage_class, class2: c2.storage_class,
          status: "COMPATIBLE (Same Storage Class)",
          reason: `Both belong to '${c1.storage_class}'.`,
          action_required: `May be stored in the same ${c1.storage_class} cabinet with secondary containment.`
        };
      }
      return {
        chem1: c1.name, chem2: c2.name,
        class1: c1.storage_class, class2: c2.storage_class,
        status: "SEPARATE SECONDARY CONTAINMENT",
        reason: `Different storage classes (${c1.storage_class} vs ${c2.storage_class}).`,
        action_required: "Segregate in separate spill trays and verify Section 7 SDS."
      };
    }
    if (path === '/api/reactivity') {
      return evaluateReactivityLocal(db, params.get('id1'), params.get('id2'));
    }
    return null;
  }

  window.__origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    const isApiCall = urlStr.includes('/api/') && !urlStr.endsWith('/api/tools.json');

    if (isApiCall && isStaticHost) {
      const payload = await handleLocalApi(urlStr);
      if (payload !== null) {
        return new Response(JSON.stringify(payload), {status: 200, headers: {'Content-Type': 'application/json'}});
      }
    }

    try {
      const res = await window.__origFetch(input, init);
      if (res && res.ok) return res;
      if (isApiCall) {
        const payload = await handleLocalApi(urlStr);
        if (payload !== null) {
          return new Response(JSON.stringify(payload), {status: 200, headers: {'Content-Type': 'application/json'}});
        }
      }
      return res;
    } catch (err) {
      if (isApiCall) {
        const payload = await handleLocalApi(urlStr);
        if (payload !== null) {
          return new Response(JSON.stringify(payload), {status: 200, headers: {'Content-Type': 'application/json'}});
        }
      }
      throw err;
    }
  };

  // PWA Install Prompt Manager
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.classList.remove('hidden');
  });

  window.installWiserApp = async function() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      alert(
        "📲 INSTALL WISER 2.6 OFFLINE APP:\n\n" +
        "• iOS / iPadOS (Safari): Tap Share (⬆️) → 'Add to Home Screen'\n" +
        "• Android (Chrome): Tap Menu (⋮) → 'Install App' or 'Add to Home screen'\n" +
        "• Windows / Mac (Chrome / Edge): Click the Install icon (⊕) in the address bar.\n\n" +
        "All 90 chemicals, ERG 2024 plumes, 25 storage rules, and 16-section OSHA SDS sheets are cached 100% offline!"
      );
    }
  };
})();
