// ApexCharts rounded donut — tree-shaken (core + donut type only).
// Owns the ring rendering + tap-to-select; the center overlay, month
// switching, and swipe behavior stay in DonutHero.

import { useMemo } from "react";
import Chart from "react-apexcharts/core";
import "apexcharts/donut";
import type { ApexOptions } from "apexcharts";

export function ApexDonut({
  series,
  labels,
  colors,
  onSelect,
}: {
  series: number[];
  labels: string[];
  colors: string[];
  onSelect: (index: number) => void;
}) {
  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "donut",
        background: "transparent",
        foreColor: "var(--muted)",
        toolbar: { show: false },
        animations: { enabled: true, speed: 450 },
        events: {
          dataPointSelection: (_e, _ctx, config?: { dataPointIndex?: number }) => {
            if (config && typeof config.dataPointIndex === "number") onSelect(config.dataPointIndex);
          },
        },
      },
      labels,
      colors,
      plotOptions: {
        pie: {
          borderRadius: 12,
          spacing: 5,
          expandOnClick: true,
          donut: {
            size: "68%",
            labels: { show: false },
          },
        },
      },
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      tooltip: { enabled: false },
      legend: { show: false },
      states: {
        hover: { filter: { type: "none" } },
        active: { filter: { type: "none" } },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels.join("|"), colors.join("|")]
  );
  return (
    <div className="apex-donut">
      <Chart options={options} series={series} type="donut" width="100%" />
    </div>
  );
}
