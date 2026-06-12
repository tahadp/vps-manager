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
	ActionInstallService
	ActionUninstallService
	ActionStartService
	ActionStopService
	ActionQuit
)

type dashboardModel struct {
	choices  []string
	actions  []DashboardAction
	cursor   int
	status   string
	actionCb func(DashboardAction) (string, error)
	done     bool
	action   DashboardAction
}

func InitialDashboardModel(status string, actionCb func(DashboardAction) (string, error)) dashboardModel {
	return dashboardModel{
		choices: []string{
			"Start Agent (Foreground)",
			"Install Service",
			"Uninstall Service",
			"Start Service",
			"Stop Service",
			"Quit",
		},
		actions: []DashboardAction{
			ActionStartForeground,
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
			selected := m.actions[m.cursor]
			if selected == ActionQuit {
				m.action = ActionQuit
				m.done = true
				return m, tea.Quit
			} else if selected == ActionStartForeground {
				m.action = ActionStartForeground
				m.done = true
				return m, tea.Quit
			}

			// Execute service actions
			res, err := m.actionCb(selected)
			if err != nil {
				m.status = fmt.Sprintf("Error: %v", err)
			} else {
				m.status = res
			}
		}
	}
	return m, nil
}

func (m dashboardModel) View() string {
	if m.done {
		return ""
	}

	var b strings.Builder
	b.WriteString(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205")).Render("\n=== VPS Agent Dashboard ===\n\n"))
	
	b.WriteString(fmt.Sprintf("Status: %s\n\n", m.status))

	for i, choice := range m.choices {
		cursor := " "
		if m.cursor == i {
			cursor = ">"
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("212")).Render(fmt.Sprintf("%s %s\n", cursor, choice)))
		} else {
			b.WriteString(fmt.Sprintf("%s %s\n", cursor, choice))
		}
	}

	b.WriteString("\n(Use arrow keys to navigate, enter to select, q to quit)\n")
	return b.String()
}

func RunDashboard(initialStatus string, actionCb func(DashboardAction) (string, error)) (DashboardAction, error) {
	m := InitialDashboardModel(initialStatus, actionCb)
	p := tea.NewProgram(m)
	finalModel, err := p.Run()
	if err != nil {
		return ActionQuit, err
	}

	if fm, ok := finalModel.(dashboardModel); ok {
		return fm.action, nil
	}
	return ActionQuit, nil
}
