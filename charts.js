let lineChart;
let bookBarChart;
let nicheBarChart;

function moneyTick(value) {
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        ticks: {
          callback: moneyTick
        }
      }
    }
  };
}

function ensureHeight(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas && !canvas.style.height) {
    canvas.style.height = "280px";
  }
}

export function renderCharts(analytics) {
  if (typeof Chart === "undefined") return;

  ensureHeight("lineChart");
  ensureHeight("bookBarChart");
  ensureHeight("nicheBarChart");

  const lineCtx = document.getElementById("lineChart");
  const bookCtx = document.getElementById("bookBarChart");
  const nicheCtx = document.getElementById("nicheBarChart");

  lineChart?.destroy();
  bookBarChart?.destroy();
  nicheBarChart?.destroy();

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels: analytics.monthLabels,
      datasets: [{
        data: analytics.monthRevenue,
        borderColor: "#0c5adb",
        backgroundColor: "rgba(12, 90, 219, 0.12)",
        borderWidth: 3,
        fill: true,
        tension: 0.25,
        pointRadius: 3
      }]
    },
    options: baseOptions()
  });

  bookBarChart = new Chart(bookCtx, {
    type: "bar",
    data: {
      labels: analytics.bookLabels,
      datasets: [{
        data: analytics.bookRevenue,
        backgroundColor: "#1d6ce0"
      }]
    },
    options: baseOptions()
  });

  nicheBarChart = new Chart(nicheCtx, {
    type: "bar",
    data: {
      labels: analytics.nicheLabels,
      datasets: [{
        data: analytics.nicheRevenue,
        backgroundColor: "#0ea67b"
      }]
    },
    options: baseOptions()
  });
}
