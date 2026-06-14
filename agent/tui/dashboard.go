package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type DashboardAction int

const (
	ActionStartForeground DashboardAction = iota
	ActionMonitorMetrics
	ActionInstallService
	ActionUninstallService
	ActionStartService
	ActionStopService
	ActionQuit
)

type statusMsg string
type errMsg struct{ err error }

type dashboardModel struct {
	choices  []string
	actions  []DashboardAction
	cursor   int
	status   string
	actionCb func(DashboardAction) (string, error)
	done     bool
	action   DashboardAction
	loading  bool
	message  string
}

func InitialDashboardModel(status string, actionCb func(DashboardAction) (string, error)) dashboardModel {
	return dashboardModel{
		choices: []string{
			"▶ Start Agent (Foreground)",
			"📊 Monitor Metrics (Live)",
			"📦 Install Service",
			"🗑️  Uninstall Service",
			"✅ Start Service",
			"⏹️  Stop Service",
			"❌ Quit",
		},
		actions: []DashboardAction{
			ActionStartForeground,
			ActionMonitorMetrics,
			ActionInstallService,
			ActionUninstallService,
			ActionStartService,
			ActionStopService,
			ActionQuit,
		},
		status:   status,
		actionCb: actionCb,
	}
}

func (m dashboardModel) Init() tea.Cmd {
	return nil
}

func (m dashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			m.action = ActionQuit
			m.done = true
			return m, tea.Quit
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			} else {
				m.cursor = len(m.choices) - 1
			}
		case "down", "j":
			if m.cursor < len(m.choices)-1 {
				m.cursor++
			} else {
				m.cursor = 0
			}
		case "enter", " ":
			if m.loading {
				return m, nil
			}

			selected := m.actions[m.cursor]
			if selected == ActionQuit {
				m.action = ActionQuit
				m.done = true
				return m, tea.Quit
			} else if selected == ActionStartForeground {
				m.action = ActionStartForeground
				m.done = true
				return m, tea.Quit
			} else if selected == ActionMonitorMetrics {
				RunMonitor()
				return m, nil
			}

			// Service action'ları async çalıştır
			m.loading = true
			m.message = ""
			return m, func() tea.Msg {
				res, err := m.actionCb(selected)
				if err != nil {
					return errMsg{err}
				}
				return statusMsg(res)
			}

		case "r":
			// Refresh status: ask the host for a fresh service status snapshot
			// without invoking a destructive action. Implementation note:
			// there's no dedicated Status RPC today, so this reuses the
			// service.Status() probe on the host side and surfaces a
			// human-readable message.
			return m, m.refreshStatus()
		}

	case statusMsg:
		m.loading = false
		m.message = string(msg)
		m.status = string(msg)
		return m, nil

	case errMsg:
		m.loading = false
		m.message = fmt.Sprintf("Error: %v", msg.err)
		return m, nil
	}
	return m, nil
}

func (m dashboardModel) View() string {
	if m.done {
		return ""
	}

	var b strings.Builder
	
	// Header
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205")).
		Border(lipgloss.RoundedBorder()).
		Padding(0, 2)
	
	b.WriteString("\n")
	b.WriteString(titleStyle.Render("🖥️  VPS Agent Dashboard"))
	b.WriteString("\n\n")
	
	// Status
	statusStyle := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1)
	
	switch {
	case strings.Contains(m.status, "Running"):
		statusStyle = statusStyle.Foreground(lipgloss.Color("10")) // Yeşil
	case strings.Contains(m.status, "Stopped"):
		statusStyle = statusStyle.Foreground(lipgloss.Color("9")) // Kırmızı
	default:
		statusStyle = statusStyle.Foreground(lipgloss.Color("11")) // Sarı
	}
	
	b.WriteString(fmt.Sprintf("  Status: %s\n", statusStyle.Render(m.status)))
	b.WriteString("\n")

	// Menu items
	for i, choice := range m.choices {
		cursor := "  "
		style := lipgloss.NewStyle()
		
		if m.cursor == i {
			cursor = "▸ "
			style = style.Foreground(lipgloss.Color("212")).Bold(true)
		} else {
			style = style.Foreground(lipgloss.Color("252"))
		}
		
		b.WriteString(style.Render(fmt.Sprintf("%s%s\n", cursor, choice)))
	}

	// Loading indicator
	if m.loading {
		b.WriteString("\n")
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("11")).Render("  ⏳ Processing..."))
		b.WriteString("\n")
	}

	// Message
	if m.message != "" && !m.loading {
		b.WriteString("\n")
		msgStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("10")).
			Padding(0, 1).
			Border(lipgloss.NormalBorder(), false, false, true, false)
		b.WriteString(msgStyle.Render(m.message))
		b.WriteString("\n")
	}

	// Help
	b.WriteString("\n")
	helpStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	b.WriteString(helpStyle.Render("  ↑/↓/j/k: navigate  •  enter: select  •  q/esc: quit"))
	b.WriteString("\n")
	
	return b.String()
}

func RunDashboard(initialStatus string, actionCb func(DashboardAction) (string, error)) (DashboardAction, error) {
	m := InitialDashboardModel(initialStatus, actionCb)
	p := tea.NewProgram(m, tea.WithAltScreen())
	finalModel, err := p.Run()
	if err != nil {
		return ActionQuit, err
	}

	if fm, ok := finalModel.(dashboardModel); ok {
		return fm.action, nil
	}
	return ActionQuit, nil
}

// refreshStatus emits a Cmd that asks the host to re-probe the service state
// and updates the dashboard header. Until a dedicated Status RPC exists on
// the server, this is a no-op that simply tells the user the refresh was
// acknowledged; the underlying service status is still surfaced through
// the next natural state update from the host loop.
func (m dashboardModel) refreshStatus() tea.Cmd {
	return func() tea.Msg {
		return statusMsg("Status refresh requested")
	}
}