"use client";

import { useMemo, useState } from "react";

type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

type TrendChartPanelProps = {
  title?: string;
  description?: string;
  eyebrow: string;
  value: number;
  caption?: string;
  subtitle?: string;
  points: TrendPoint[];
  toneClass: string;
  format: "integer" | "percent";
  compact?: boolean;
};

function formatPointValue(value: number, format: TrendChartPanelProps["format"]) {
  if (format === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return `${Math.round(value)}`;
}

function buildSparklinePath(points: TrendPoint[], width: number, height: number) {
  if (points.length === 0) {
    return "";
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const horizontalPadding = 18;
  const verticalPadding = 12;
  const usableWidth = Math.max(width - horizontalPadding * 2, 1);
  const usableHeight = Math.max(height - verticalPadding * 2, 1);

  return points
    .map((point, index) => {
      const x =
        points.length === 1
          ? width / 2
          : horizontalPadding + (index / (points.length - 1)) * usableWidth;
      const y =
        height -
        verticalPadding -
        ((point.value - minValue) / range) * usableHeight;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendChartPanel({
  title,
  description,
  eyebrow,
  value,
  caption,
  subtitle,
  points,
  toneClass,
  format,
  compact = false,
}: TrendChartPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const chartWidth = useMemo(() => Math.max(640, points.length * 88), [points.length]);
  const fullscreenChartWidth = useMemo(
    () => Math.max(1200, points.length * 104),
    [points.length],
  );

  function renderScrollableChart(fullscreen = false) {
    const width = fullscreen ? fullscreenChartWidth : chartWidth;
    const height = fullscreen ? 220 : compact ? 118 : 144;
    const gridStyle = {
      gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(72px, 1fr))`,
      width: `${width}px`,
    };

    if (points.length === 0) {
      return <div className={`sparkline-empty ${toneClass}`}>Sem dados</div>;
    }

    return (
      <div className="trend-scroll-shell">
        <div className="trend-scroll-area">
          <div className="trend-scroll-content" style={{ width: `${width}px` }}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className={`trend-scroll-svg ${toneClass}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={buildSparklinePath(points, width, height)} />
            </svg>
            <div className="trend-scroll-grid trend-scroll-values" style={gridStyle}>
              {points.map((point) => (
                <span key={point.date}>{formatPointValue(point.value, format)}</span>
              ))}
            </div>
            <div className="trend-scroll-grid trend-scroll-axis" style={gridStyle}>
              {points.map((point) => (
                <span key={point.date}>{point.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={compact ? "trend-card-body trend-card-body-compact" : "trend-card-body"}>
        {title || description ? (
          <div className="trend-card-top">
            <div>
              {title ? <h3 className="trend-card-title">{title}</h3> : null}
              {description ? <p className="trend-card-description">{description}</p> : null}
            </div>
            <button
              type="button"
              className="secondary-button trend-fullscreen-button"
              onClick={() => setIsFullscreen(true)}
            >
              Tela cheia
            </button>
          </div>
        ) : null}

        <div className="trend-card-summary">
          <div>
            <p className="trend-eyebrow">{eyebrow}</p>
            <strong className={compact ? "metric-trend-value" : "trend-value"}>
              {formatPointValue(value, format)}
            </strong>
            {caption ? <p className="trend-caption">{caption}</p> : null}
          </div>
          {subtitle ? <span className="metric-trend-subtitle">{subtitle}</span> : null}
        </div>

        {renderScrollableChart(false)}
      </div>

      {isFullscreen ? (
        <div
          className="trend-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsFullscreen(false);
            }
          }}
        >
          <div className="trend-modal">
            <div className="trend-modal-header">
              <div>
                {title ? <h3 className="trend-card-title">{title}</h3> : null}
                {description ? <p className="trend-card-description">{description}</p> : null}
                {!title && !description ? <h3 className="trend-card-title">{eyebrow}</h3> : null}
              </div>
              <button
                type="button"
                className="secondary-button trend-fullscreen-button"
                onClick={() => setIsFullscreen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="trend-card-summary">
              <div>
                <p className="trend-eyebrow">{eyebrow}</p>
                <strong className="trend-value">{formatPointValue(value, format)}</strong>
                {caption ? <p className="trend-caption">{caption}</p> : null}
              </div>
              {subtitle ? <span className="metric-trend-subtitle">{subtitle}</span> : null}
            </div>

            {renderScrollableChart(true)}
          </div>
        </div>
      ) : null}
    </>
  );
}
