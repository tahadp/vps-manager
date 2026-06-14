package tui

import (
	"fmt"
	"strings"
	"time"

	"agent/telemetry"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type metricsTickMsg time.Time

type monitorModel struct {
	metrics  *telemetry.Metrics
	quitting bool
}

func InitialMonitorModel() monitorModel {
	return monitorModel{}
}

func (m monitorModel) Init() tea.Cmd {
	return tea.Batch(tickCmd(), collectMetricsCmd())
}

func tickCmd() tea.Cmd {
	return tea.Tick(1*time.Second, func(t time.Time) tea.Msg {
		return metricsTickMsg(t)
	})
}

func collectMetricsCmd() tea.Cmd {
	return func() tea.Msg {
		m, err := telemetry.CollectMetrics()
		if err != nil {
			return errMsg{err}
		}
		return metricsUpdateMsg(m)
	}
}

type metricsUpdateMsg *telemetry.Metrics

func (m monitorModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			m.quitting = true
			return m, tea.Quit
		}
	case metricsTickMsg:
		return m, collectMetricsCmd()
	case metricsUpdateMsg:
		m.metrics = (*telemetry.Metrics)(msg)
		return m, tickCmd()
	}
	return m, nil
}

func renderBar(label string, value float64, color lipgloss.TerminalColor) string {
	width := 30
	filled := int(value / 100 * float64(width))
	if filled > width {
		filled = width
	}
	if filled < 0 {
		filled = 0
	}

	empty := width - filled

	barStyle := lipgloss.NewStyle().Foreground(color)
	labelStyle := lipgloss.NewStyle().Width(8).Foreground(lipgloss.Color("252"))

	var bar string
	if filled > 0 {
		bar += barStyle.Render(strings.Repeat("#", filled))
	}
	if empty > 0 {
		bar += lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(strings.Repeat("-", empty))
	}

	var colorCode lipgloss.TerminalColor
	switch {
	case value >= 90:
		colorCode = lipgloss.Color("9")
	case value >= 70:
		colorCode = lipgloss.Color("11")
	default:
		colorCode = lipgloss.Color("10")
	}

	return fmt.Sprintf("  %s %s %s",
		labelStyle.Render(label),
		bar,
		lipgloss.NewStyle().Foreground(colorCode).Render(fmt.Sprintf("%5.1f%%", value)),
	)
}

func renderNetBar(label string, value float64, color lipgloss.TerminalColor) string {
	labelStyle := lipgloss.NewStyle().Width(8).Foreground(lipgloss.Color("252"))
	valueStyle := lipgloss.NewStyle().Foreground(color)

	var display string
	switch {
	case value >= 1024*1024:
		display = fmt.Sprintf("%.1f MB/s", value/1024/1024)
	case value >= 1024:
		display = fmt.Sprintf("%.1f KB/s", value/1024)
	default:
		display = fmt.Sprintf("%.0f B/s", value)
	}

	return fmt.Sprintf("  %s %s",
		labelStyle.Render(label),
		valueStyle.Render(display),
	)
}

func (m monitorModel) View() string {
	if m.quitting {
		return ""
	}

	var b strings.Builder

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205")).
		Border(lipgloss.RoundedBorder()).
		Padding(0, 2)

	b.WriteString("\n")
	b.WriteString(titleStyle.Render("=== System Monitor ==="))
	b.WriteString("\n\n")

	if m.metrics == nil {
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("11")).Render("  Collecting metrics..."))
		b.WriteString("\n")
	} else {
		met := m.metrics

		b.WriteString(renderBar("CPU", met.CPUUsage, lipgloss.Color("39")))
		b.WriteString("\n")
		b.WriteString(renderBar("RAM", met.RAMUsage, lipgloss.Color("135")))
		b.WriteString("\n")
		b.WriteString(renderBar("Disk", met.DiskUsage, lipgloss.Color("208")))
		b.WriteString("\n\n")

		b.WriteString(renderNetBar("UL", met.NetTx, lipgloss.Color("10")))
		b.WriteString("\n")
		b.WriteString(renderNetBar("DL", met.NetRx, lipgloss.Color("39")))
		b.WriteString("\n\n")

		totalGB := met.RAMTotal / 1024 / 1024 / 1024
		infoStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
		b.WriteString(infoStyle.Render(fmt.Sprintf("  Total RAM: %.1f GB", totalGB)))
		b.WriteString("\n")
	}

	b.WriteString("\n")
	helpStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	b.WriteString(helpStyle.Render("  q/esc: back to menu"))
	b.WriteString("\n")

	return b.String()
}

func RunMonitor() {
	p := tea.NewProgram(InitialMonitorModel(), tea.WithAltScreen())
	p.Run()
}
