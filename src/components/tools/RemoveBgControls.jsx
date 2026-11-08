import React, { useState, useEffect } from 'react';
import { Sparkles, Wand2, Shield, RefreshCw } from 'lucide-react';
import { hexToRgb } from '../../utils/bgRemovalCore';

const PRESETS = [
  { label: 'Auto Product', tolerance: 40, feather: 50, mode: 'contiguous', isAutoBg: true },
  { label: 'Logo / Graphic', tolerance: 35, feather: 30, mode: 'global', isAutoBg: true },
  { label: 'Signature / Scan', tolerance: 65, feather: 20, mode: 'global', isAutoBg: false, customColor: '#ffffff' },
  { label: 'Green Screen', tolerance: 55, feather: 50, mode: 'contiguous', isAutoBg: false, customColor: '#00ff00' }
];

export default function RemoveBgControls({ onChange, estimatedBgHex }) {
  const [tolerance, setTolerance] = useState(40);
  const [feather, setFeather] = useState(50); // 0 to 100%
  const [mode, setMode] = useState('contiguous'); // 'contiguous' | 'global'
  const [isAutoBg, setIsAutoBg] = useState(true);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [colorUnmix, setColorUnmix] = useState(true);

  useEffect(() => {
    const bg = isAutoBg ? null : hexToRgb(customColor);
    onChange({
      tolerance,
      feather: feather / 100,
      mode,
      bg,
      colorUnmix
    });
  }, [tolerance, feather, mode, isAutoBg, customColor, colorUnmix]);

  const applyPreset = (p) => {
    setTolerance(p.tolerance);
    setFeather(p.feather);
    setMode(p.mode);
    setIsAutoBg(p.isAutoBg);
    if (p.customColor) setCustomColor(p.customColor);
  };

  const handleReset = () => {
    setTolerance(40);
    setFeather(50);
    setMode('contiguous');
    setIsAutoBg(true);
    setCustomColor('#ffffff');
    setColorUnmix(true);
  };

  return (
    <div className="tool-controls-flow" style={{ gap: '16px' }}>
      {/* 1. Quick Workflow Presets */}
      <div className="control-group">
        <label className="input-header-label">Quick Presets</label>
        <div className="preset-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="pill-btn"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Mode Selector: Contiguous vs Global */}
      <div className="control-group">
        <label className="input-header-label">Removal Mode</label>
        <div className="inputs-2col-grid">
          <button
            type="button"
            className={`pill-btn ${mode === 'contiguous' ? 'is-active' : ''}`}
            onClick={() => setMode('contiguous')}
            title="Flood fills from borders. Protects matching colors inside your foreground object."
          >
            Contiguous (Borders)
          </button>
          <button
            type="button"
            className={`pill-btn ${mode === 'global' ? 'is-active' : ''}`}
            onClick={() => setMode('global')}
            title="Removes background color everywhere across the entire image, including enclosed gaps."
          >
            Global (All Gaps)
          </button>
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {mode === 'contiguous'
            ? '✓ Only removes background connected to the outer border. Ideal for photos, portraits, and clothes.'
            : '✓ Removes background matching color across the whole image. Ideal for logos, icons, donuts, and scans.'}
        </p>
      </div>

      {/* 3. Color Tolerance Slider */}
      <div className="control-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <label className="input-header-label" style={{ margin: 0 }}>Color Tolerance</label>
          <span className="mono" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.8125rem' }}>
            {tolerance}
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          value={tolerance}
          onChange={(e) => setTolerance(parseInt(e.target.value, 10) || 5)}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7188rem', color: 'var(--color-text-muted)' }}>
          <span>Strict (5)</span>
          <span>Balanced (40)</span>
          <span>Broad (120)</span>
        </div>
      </div>

      {/* 4. Edge Softness / Feather Slider */}
      <div className="control-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <label className="input-header-label" style={{ margin: 0 }}>Edge Softness (Feather)</label>
          <span className="mono" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.8125rem' }}>
            {feather}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={feather}
          onChange={(e) => setFeather(parseInt(e.target.value, 10) || 0)}
          style={{ width: '100%' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          Blends edge transition for natural, anti-aliased cutouts without jagged borders.
        </span>
      </div>

      {/* 5. Background Color Source */}
      <div className="control-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="input-header-label" style={{ margin: 0 }}>Background Color</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className={`pill-btn ${isAutoBg ? 'is-active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              onClick={() => setIsAutoBg(true)}
            >
              Auto Detect
            </button>
            <button
              type="button"
              className={`pill-btn ${!isAutoBg ? 'is-active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              onClick={() => setIsAutoBg(false)}
            >
              Custom
            </button>
          </div>
        </div>

        {isAutoBg ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-surface-subtle)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px'
          }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: estimatedBgHex || '#ffffff',
                border: '1px solid var(--color-border-strong)'
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)' }}>
              Detected Border Median: <strong className="mono">{estimatedBgHex || '#ffffff'}</strong>
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              style={{
                width: '32px',
                height: '32px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: 'transparent',
                padding: 0
              }}
            />
            <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--color-text)' }}>
              {customColor.toUpperCase()}
            </span>
            <div className="preset-pills" style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
              {['#ffffff', '#000000', '#00ff00', '#0000ff', '#f3f4f6'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="pill-btn"
                  style={{
                    width: '22px',
                    height: '22px',
                    padding: 0,
                    backgroundColor: c,
                    border: customColor.toLowerCase() === c.toLowerCase() ? '2px solid var(--color-accent)' : '1px solid #d6d3d1',
                    borderRadius: '4px'
                  }}
                  onClick={() => setCustomColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6. Anti-Halo (Color Unmixing) Checkbox */}
      <div className="control-group">
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            fontSize: '0.8125rem',
            color: 'var(--color-text)',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <input
            type="checkbox"
            checked={colorUnmix}
            onChange={(e) => setColorUnmix(e.target.checked)}
            style={{ marginTop: '2px', accentColor: 'var(--color-accent)' }}
          />
          <div>
            <span style={{ fontWeight: 600 }}>Anti-Halo Unmixing</span>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Mathematically removes background color bleed from transparent edges, preventing white/green fringes.
            </p>
          </div>
        </label>
      </div>

      {/* 7. Reset Button */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
        <button
          type="button"
          className="btn-change-image"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleReset}
        >
          <RefreshCw size={14} />
          <span>Reset Settings</span>
        </button>
      </div>
    </div>
  );
}

