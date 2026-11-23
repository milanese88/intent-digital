import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { estimateQuickFinderProfit } from './dealBreakdownEngine.js';

// Developer studies — study one builder/developer through the deals you add
// from the Flip & Build Finder. Step 1: studies, companies, deal table + profits.

const C = {
  espresso: '#1B130D',
  burgundy: '#3A1418',
  cream: '#FAF8F4',
  beige: '#F2EEE8',
  border: '#E4DDD3',
  line: '#EFEAE3',
  muted: '#7A6E64',
  rose: '#B5707D',
  loss: '#8A2B2B'
};
const SERIF = "var(--font-instrument, 'Instrument Serif', Georgia, serif)";
const SANS = "var(--font-body, 'Montserrat', sans-serif)";
const LABEL = { fontFamily: SANS, fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function money(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}
function monthLabel(y, m) {
  const yy = Number(y);
  const mm = Number(m);
  if (!yy) return '';
  return mm >= 1 && mm <= 12 ? `${MONTHS[mm - 1]} ${yy}` : String(yy);
}
function median(list) {
  const v = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function isBuild(type) {
  return String(type || '').includes('build');
}

// Profit for one study deal, using the same engine as the Finder.
// A build-cost override replaces the $/sf estimate with your real number.
export function computeStudyDeal(deal) {
  const row = deal.row_snapshot || {};
  let est = null;
  try {
    est = estimateQuickFinderProfit(row);
    const sqft = Number(row.living_sqft) || 0;
    if (deal.build_cost_override != null && sqft > 0 && est?.rehabLevel) {
      const rate = Number(deal.build_cost_override) / sqft;
      est = estimateQuickFinderProfit(row, { [est.rehabLevel]: { min: rate, max: rate } });
    }
  } catch (_) {
    est = null;
  }
  const sell = Number(row.sell_price) || null;
  const profit = est?.estProfit ?? null;
  return {
    row,
    est,
    buy: Number(row.buy_price) || null,
    sell,
    months: Number(row.hold_months) || null,
    buildCost: deal.build_cost_override != null ? Number(deal.build_cost_override) : (est?.hardCost ?? null),
    overridden: deal.build_cost_override != null,
    profit,
    margin: profit != null && sell ? profit / sell : null,
    roc: est?.roiPct ?? null
  };
}

function Tag({ kind }) {
  const map = {
    recorded: { bg: '#EFEAE3', fg: '#5E544C', t: 'Recorded' },
    estimated: { bg: '#F5EFF0', fg: '#6E2231', t: 'Estimated' },
    override: { bg: C.burgundy, fg: C.cream, t: 'Your number' }
  };
  const s = map[kind];
  return (
    <span style={{ fontFamily: SANS, fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: '4px', backgroundColor: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {s.t}
    </span>
  );
}

function PillButton({ children, onClick, dark = false, disabled = false, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 18px',
        borderRadius: '999px',
        border: dark ? `1px solid ${C.burgundy}` : `1px solid ${C.border}`,
        backgroundColor: dark ? C.burgundy : '#FFFFFF',
        color: dark ? C.cream : C.espresso,
        fontFamily: SANS,
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </button>
  );
}

async function api(method, { query = '', body } = {}) {
  const res = await fetch(`/api/investor/developer-studies${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// ---------------------------------------------------------------------------
// Study list
// ---------------------------------------------------------------------------
function StudyList({ items, loading, schemaNeedsUpdate, onOpen, onCreated }) {
  const [name, setName] = useState('');
  const [companies, setCompanies] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter the developer name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api('POST', {
        body: {
          action: 'create_study',
          name,
          companies: companies.split(/[,\n]/).map((c) => c.trim()).filter(Boolean)
        }
      });
      setName('');
      setCompanies('');
      onCreated(data.study);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: '12px', border: `1px solid ${C.border}`, backgroundColor: '#FFFFFF', fontFamily: SANS, fontSize: '13px', color: C.espresso };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <p style={{ ...LABEL, margin: '0 0 8px' }}>Developer studies</p>
        <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(30px, 3.2vw, 44px)', lineHeight: 1.05, color: C.espresso }}>
          Study the builders, <em>copy what works.</em>
        </h2>
        <p style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: '13px', color: '#5E544C', maxWidth: '640px', lineHeight: 1.6 }}>
          Create a study for a developer, then add their deals from the Flip &amp; Build Finder with the <b style={{ fontWeight: 600 }}>+ Study</b> button on any row.
        </p>
      </div>

      {schemaNeedsUpdate && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', backgroundColor: '#F5EFF0', color: '#6E2231', fontFamily: SANS, fontSize: '12.5px' }}>
          The database tables for developer studies aren't set up yet. Run <code>migrations/add_developer_studies.sql</code> in Supabase.
        </div>
      )}

      <form onSubmit={create} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '18px', padding: '20px 22px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) auto', gap: '14px', alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={LABEL}>Developer name</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Atlantic Shore Builders" style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={LABEL}>Companies they buy through (optional)</span>
          <input value={companies} onChange={(e) => setCompanies(e.target.value)} placeholder="ASB Seabreeze LLC, 1140 Marine Holdings LLC" style={inputStyle} />
        </label>
        <PillButton type="submit" dark disabled={saving}>{saving ? 'Creating…' : 'New study →'}</PillButton>
        {error && <p style={{ gridColumn: '1 / -1', margin: 0, fontFamily: SANS, fontSize: '12px', color: C.loss }}>{error}</p>}
      </form>

      {loading ? (
        <p style={{ fontFamily: SANS, fontSize: '12.5px', color: C.muted }}>Loading studies…</p>
      ) : items.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: '12.5px', color: C.muted }}>Your studies will show here.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              style={{ textAlign: 'left', backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '18px', padding: '20px 22px', cursor: 'pointer', fontFamily: SANS, color: C.espresso, display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <span style={{ fontFamily: SERIF, fontSize: '26px', lineHeight: 1.1 }}>{s.name}</span>
              <span style={{ fontSize: '11.5px', color: C.muted }}>
                {s.deal_count} {s.deal_count === 1 ? 'deal' : 'deals'} · {(s.companies || []).length} {(s.companies || []).length === 1 ? 'company' : 'companies'}
              </span>
              <span style={{ ...LABEL, color: C.burgundy }}>Open study →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One study
// ---------------------------------------------------------------------------
function StudyDetail({ studyId, onBack, onGoToFinder, onOpenDealBreakdown, onChanged }) {
  const [study, setStudy] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCompany, setNewCompany] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [costDrafts, setCostDrafts] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api('GET', { query: `?id=${encodeURIComponent(studyId)}` });
      setStudy(data.study);
      setDeals(data.deals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => { load(); }, [load]);

  const saveStudy = async (patch) => {
    try {
      const data = await api('PATCH', { body: { study_id: studyId, ...patch } });
      setStudy(data.study);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCost = async (deal) => {
    const raw = costDrafts[deal.id];
    if (raw === undefined) return;
    try {
      const data = await api('PATCH', { body: { deal_id: deal.id, build_cost_override: raw === '' ? null : raw } });
      setDeals((list) => list.map((d) => (d.id === deal.id ? data.deal : d)));
      setCostDrafts((m) => { const n = { ...m }; delete n[deal.id]; return n; });
    } catch (err) {
      setError(err.message);
    }
  };

  const removeDeal = async (deal) => {
    try {
      await api('DELETE', { query: `?deal_id=${encodeURIComponent(deal.id)}` });
      setDeals((list) => list.filter((d) => d.id !== deal.id));
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteStudy = async () => {
    try {
      await api('DELETE', { query: `?id=${encodeURIComponent(studyId)}` });
      onChanged();
      onBack();
    } catch (err) {
      setError(err.message);
    }
  };

  const computed = useMemo(() => deals.map((d) => ({ deal: d, c: computeStudyDeal(d) })), [deals]);

  const kpis = useMemo(() => {
    const cs = computed.map((x) => x.c);
    const builds = computed.filter((x) => isBuild(x.deal.deal_type || x.c.row.deal_type)).length;
    const margins = cs.map((c) => c.margin).filter((v) => v != null);
    return {
      count: cs.length,
      builds,
      flips: cs.length - builds,
      medProfit: median(cs.map((c) => c.profit)),
      medMonths: median(cs.map((c) => c.months)),
      avgMargin: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
      volume: cs.reduce((n, c) => n + (c.sell || 0), 0),
      losses: cs.filter((c) => c.profit != null && c.profit < 0).length
    };
  }, [computed]);

  if (loading && !study) {
    return <p style={{ fontFamily: SANS, fontSize: '12.5px', color: C.muted }}>Loading study…</p>;
  }
  if (!study) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
        <p style={{ fontFamily: SANS, fontSize: '12.5px', color: C.loss }}>{error || 'Study not found.'}</p>
        <PillButton onClick={onBack}>← All studies</PillButton>
      </div>
    );
  }

  const companies = study.companies || [];
  const th = { ...LABEL, fontSize: '9px', textAlign: 'left', padding: '10px', whiteSpace: 'nowrap' };
  const td = { padding: '12px 10px', fontFamily: SANS, fontSize: '12px', color: C.espresso, verticalAlign: 'middle' };
  const sub = { display: 'block', fontSize: '10.5px', color: C.muted, marginTop: '2px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: SANS, color: C.espresso }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', padding: 0, fontFamily: SANS, fontSize: '12px', color: C.muted, cursor: 'pointer' }}>← All studies</button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <PillButton onClick={onGoToFinder}>+ Add deals from Finder</PillButton>
        </div>
      </div>

      {/* Cover */}
      <header style={{ paddingBottom: '22px', borderBottom: `1px solid ${C.border}` }}>
        <p style={{ ...LABEL, margin: '0 0 10px' }}>Developer study</p>
        {editingName ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) { saveStudy({ name: nameDraft }); setEditingName(false); } }}
            style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={{ fontFamily: SERIF, fontSize: '40px', padding: '4px 10px', borderRadius: '10px', border: `1px solid ${C.border}`, color: C.espresso, minWidth: '320px' }} />
            <PillButton type="submit" dark>Save</PillButton>
            <PillButton onClick={() => setEditingName(false)}>Cancel</PillButton>
          </form>
        ) : (
          <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(36px, 4.4vw, 60px)', lineHeight: 1 }}>
            {study.name},<br /><em>how they make money.</em>
            <button type="button" onClick={() => { setNameDraft(study.name); setEditingName(true); }} style={{ marginLeft: '14px', verticalAlign: 'middle', border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '11px', color: C.muted, cursor: 'pointer' }}>Rename</button>
          </h2>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px', alignItems: 'center' }}>
          {companies.map((co) => (
            <span key={co} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px 6px 12px', borderRadius: '999px', backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, fontSize: '11.5px' }}>
              {co}
              <button type="button" aria-label={`Remove ${co}`} onClick={() => saveStudy({ companies: companies.filter((x) => x !== co) })} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}>×</button>
            </span>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (newCompany.trim()) { saveStudy({ companies: [...companies, newCompany.trim()] }); setNewCompany(''); } }}
            style={{ display: 'inline-flex' }}
          >
            <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="+ Add a company (LLC)" style={{ padding: '6px 12px', borderRadius: '999px', border: `1px dashed #B9AEA2`, backgroundColor: 'transparent', fontFamily: SANS, fontSize: '11.5px', color: C.espresso, width: '200px' }} />
          </form>
        </div>
      </header>

      {error && <p style={{ margin: 0, fontSize: '12px', color: C.loss }}>{error}</p>}

      {/* KPIs */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '16px' }}>
        {[
          ['Deals studied', String(kpis.count), `${kpis.builds} builds · ${kpis.flips} flips`],
          ['Median profit', money(kpis.medProfit), 'est. net, per deal'],
          ['Typical time', kpis.medMonths != null ? `${Math.round(kpis.medMonths)} mo` : '—', 'buy → sale'],
          ['Avg margin', kpis.avgMargin != null ? `${Math.round(kpis.avgMargin * 100)}%` : '—', kpis.losses ? `${kpis.losses} lost money` : 'profit ÷ sale price'],
          ['Volume sold', money(kpis.volume), 'total of sale prices']
        ].map(([label, value, note], i) => (
          <div key={label} style={{ padding: '18px 20px', borderLeft: i === 0 ? 'none' : `1px solid ${C.line}` }}>
            <p style={{ ...LABEL, margin: 0 }}>{label}</p>
            <p style={{ margin: '6px 0 0', fontFamily: SERIF, fontSize: '34px', lineHeight: 1 }}>{value}</p>
            <p style={{ margin: '4px 0 0', fontSize: '10.5px', color: C.muted }}>{note}</p>
          </div>
        ))}
      </section>

      {/* Deals */}
      <section style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '18px', padding: '22px 20px 10px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', padding: '0 10px 12px' }}>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: '26px' }}>The deals <em>({deals.length})</em></h3>
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: C.muted }}>
            <Tag kind="recorded" /> <Tag kind="estimated" /> <Tag kind="override" />
          </span>
        </div>

        {deals.length === 0 ? (
          <div style={{ padding: '28px 10px 26px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: '22px' }}>Add this developer's first deal</p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#5E544C' }}>In the Flip &amp; Build Finder, click <b style={{ fontWeight: 600 }}>+ Study</b> on any row and pick this study.</p>
            <PillButton dark onClick={onGoToFinder}>Open the Finder →</PillButton>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
            <thead>
              <tr>
                {['Property', 'Type', 'Bought', 'Build / reno cost', 'Sold', 'Held', 'Est. profit', 'Margin', ''].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {computed.map(({ deal, c }) => {
                const r = c.row;
                const build = isBuild(deal.deal_type || r.deal_type);
                const draft = costDrafts[deal.id];
                return (
                  <tr key={deal.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td}>
                      <b style={{ fontWeight: 600 }}>{deal.address || r.address || deal.parcel_id}</b>
                      <span style={sub}>{[r.city, deal.zip || r.zip].filter(Boolean).join(' ')}{r.living_sqft ? ` · ${Number(r.living_sqft).toLocaleString()} sf` : ''}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: '999px', backgroundColor: build ? C.espresso : '#F5EFF0', color: build ? C.cream : '#6E2231' }}>
                        {build ? 'NEW BUILD' : 'FLIP'}
                      </span>
                    </td>
                    <td style={td}>{money(c.buy)} <Tag kind="recorded" /><span style={sub}>{monthLabel(r.buy_year, r.buy_month)}</span></td>
                    <td style={td}>
                      <input
                        value={draft !== undefined ? draft : (c.overridden ? String(Math.round(c.buildCost)) : '')}
                        placeholder={c.buildCost != null ? money(c.buildCost) : 'Enter $'}
                        onChange={(e) => setCostDrafts((m) => ({ ...m, [deal.id]: e.target.value }))}
                        onBlur={() => saveCost(deal)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        title="Type the real build or renovation cost if you know it. Clear it to go back to the estimate."
                        style={{ width: '96px', padding: '6px 8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontFamily: SANS, fontSize: '12px', color: C.espresso }}
                      />{' '}
                      <Tag kind={c.overridden ? 'override' : 'estimated'} />
                    </td>
                    <td style={td}>{money(c.sell)} <Tag kind="recorded" /><span style={sub}>{monthLabel(r.sell_year, r.sell_month)}</span></td>
                    <td style={td}>{c.months != null ? `${Math.round(c.months)} mo` : '—'}</td>
                    <td style={{ ...td, fontWeight: 600, color: c.profit != null && c.profit < 0 ? C.loss : C.burgundy }}>{money(c.profit)}</td>
                    <td style={td}>{c.margin != null ? `${Math.round(c.margin * 100)}%` : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {onOpenDealBreakdown && (
                        <button type="button" onClick={() => onOpenDealBreakdown(r)} style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '11px', fontWeight: 600, color: C.burgundy, cursor: 'pointer', marginRight: '10px' }}>Break down →</button>
                      )}
                      <button type="button" onClick={() => removeDeal(deal)} aria-label="Remove deal from study" style={{ border: 'none', background: 'transparent', fontSize: '15px', color: C.muted, cursor: 'pointer' }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: '16px', display: 'flex', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap', fontSize: '11px', color: '#5E544C', lineHeight: 1.6 }}>
        <p style={{ margin: 0, maxWidth: '760px' }}>
          <span style={{ ...LABEL, marginRight: '10px' }}>How we calculated</span>
          Prices and dates come from county deeds. Build and renovation costs use the Finder's $/sf estimate unless you type the real number. Profit includes carrying and selling costs, the same way as the Deal Breakdown.
        </p>
        {confirmDelete ? (
          <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
            <span>Delete this study and its deal list?</span>
            <button type="button" onClick={deleteStudy} style={{ border: 'none', background: 'transparent', color: C.loss, fontFamily: SANS, fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} style={{ border: 'none', background: 'transparent', color: C.muted, fontFamily: SANS, fontSize: '11px', cursor: 'pointer' }}>Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} style={{ border: 'none', background: 'transparent', color: C.muted, fontFamily: SANS, fontSize: '11px', cursor: 'pointer' }}>Delete study</button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function DeveloperStudies({ initialStudyId = null, onGoToFinder = () => {}, onOpenDealBreakdown = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schemaNeedsUpdate, setSchemaNeedsUpdate] = useState(false);
  const [activeId, setActiveId] = useState(initialStudyId);

  const refresh = useCallback(async () => {
    try {
      const data = await api('GET');
      setItems(data.items || []);
      setSchemaNeedsUpdate(Boolean(data.schemaNeedsUpdate));
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (initialStudyId) setActiveId(initialStudyId); }, [initialStudyId]);

  if (activeId) {
    return (
      <StudyDetail
        studyId={activeId}
        onBack={() => { setActiveId(null); refresh(); }}
        onGoToFinder={onGoToFinder}
        onOpenDealBreakdown={onOpenDealBreakdown}
        onChanged={refresh}
      />
    );
  }
  return (
    <StudyList
      items={items}
      loading={loading}
      schemaNeedsUpdate={schemaNeedsUpdate}
      onOpen={setActiveId}
      onCreated={(study) => { setItems((list) => [study, ...list]); setActiveId(study.id); }}
    />
  );
}

// Small helper used by the Finder's "+ Study" menu
export async function listStudiesForMenu() {
  const data = await api('GET');
  return data.items || [];
}
export async function addFinderRowToStudy(studyId, row) {
  return api('POST', { body: { action: 'add_deal', study_id: studyId, row } });
}
