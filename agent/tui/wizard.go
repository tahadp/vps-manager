package tui

import (
	"fmt"
	"net"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type WizardResult struct {
	VpsID     string
	BackendIP string
	APIKey    string
	Canceled  bool
}

type wizardModel struct {
	inputs   []textinput.Model
	focus    int
	err      error
	result   *WizardResult
	done     bool
	quitting bool
}

func InitialWizardModel() wizardModel {
	m := wizardModel{
		inputs: make([]textinput.Model, 3),
		result: &WizardResult{},
	}

	var t textinput.Model
	for i := range m.inputs {
		t = textinput.New()
		t.Cursor.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
		t.CharLimit = 128

		switch i {
		case 0:
			t.Placeholder = "VPS ID (e.g. vps-123)"
			t.Focus()
			t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
			t.TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
		case 1:
			t.Placeholder = "Backend IP:Port (e.g. 127.0.0.1:50051)"
		case 2:
			t.Placeholder = "API Key"
			t.EchoMode = textinput.EchoPassword
			t.EchoCharacter = '•'
		}

		m.inputs[i] = t
	}

	return m
}

func (m wizardModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m wizardModel) validate() error {
	vpsID := strings.TrimSpace(m.inputs[0].Value())
	backendIP := strings.TrimSpace(m.inputs[1].Value())
	apiKey := strings.TrimSpace(m.inputs[2].Value())

	if vpsID == "" {
		return fmt.Errorf("VPS ID cannot be empty")
	}
	if len(vpsID) < 2 {
		return fmt.Errorf("VPS ID must be at least 2 characters")
	}

	if backendIP == "" {
		return fmt.Errorf("Backend IP cannot be empty")
	}
	// IP:Port format kontrolü
	host, port, err := net.SplitHostPort(backendIP)
	if err != nil {
		return fmt.Errorf("Invalid format. Use IP:Port (e.g. 127.0.0.1:50051)")
	}
	if net.ParseIP(host) == nil {
		return fmt.Errorf("Invalid IP address: %s", host)
	}
	if port == "" {
		return fmt.Errorf("Port number required")
	}

	if apiKey == "" {
		return fmt.Errorf("API Key cannot be empty")
	}
	if len(apiKey) < 8 {
		return fmt.Errorf("API Key must be at least 8 characters")
	}

	return nil
}

func (m wizardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			m.result.Canceled = true
			m.done = true
			m.quitting = true
			return m, tea.Quit
		case tea.KeyEnter, tea.KeyUp, tea.KeyDown, tea.KeyTab:
			s := msg.String()

			if s == "enter" && m.focus == len(m.inputs)-1 {
				// Validation
				if err := m.validate(); err != nil {
					m.err = err
					return m, nil
				}
				
				m.result.VpsID = strings.TrimSpace(m.inputs[0].Value())
				m.result.BackendIP = strings.TrimSpace(m.inputs[1].Value())
				m.result.APIKey = strings.TrimSpace(m.inputs[2].Value())
				m.done = true
				m.quitting = true
				return m, tea.Quit
			}

			if s == "up" || s == "shift+tab" {
				m.focus--
			} else {
				m.focus++
			}

			if m.focus > len(m.inputs)-1 {
				m.focus = 0
			} else if m.focus < 0 {
				m.focus = len(m.inputs) - 1
			}

			cmds = make([]tea.Cmd, len(m.inputs))
			for i := 0; i <= len(m.inputs)-1; i++ {
				if i == m.focus {
					cmds[i] = m.inputs[i].Focus()
					m.inputs[i].PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
					m.inputs[i].TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
					continue
				}
				m.inputs[i].Blur()
				m.inputs[i].PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
				m.inputs[i].TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
			}

			return m, tea.Batch(cmds...)
		}
	}

	for i := range m.inputs {
		m.inputs[i], cmds = m.UpdateInput(msg, m.inputs[i])
	}

	return m, tea.Batch(cmds...)
}

func (m *wizardModel) UpdateInput(msg tea.Msg, input textinput.Model) (textinput.Model, []tea.Cmd) {
	var cmds []tea.Cmd
	var cmd tea.Cmd
	input, cmd = input.Update(msg)
	cmds = append(cmds, cmd)
	return input, cmds
}

func (m wizardModel) View() string {
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
	b.WriteString(titleStyle.Render("🔧 VPS Agent Configuration"))
	b.WriteString("\n\n")
	b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render("  Configure your agent to connect to the backend server."))
	b.WriteString("\n\n")

	// Input labels
	labels := []string{"  VPS ID:", "  Backend:", "  API Key:"}
	for i := range m.inputs {
		labelStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true)
		if m.focus == i {
			labelStyle = labelStyle.Foreground(lipgloss.Color("205"))
		}
		b.WriteString(labelStyle.Render(labels[i]))
		b.WriteString("\n")
		b.WriteString("  ")
		b.WriteString(m.inputs[i].View())
		b.WriteString("\n\n")
	}

	// Error message
	if m.err != nil {
		errStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("9")).
			Bold(true).
			Padding(0, 1)
		b.WriteString(errStyle.Render(fmt.Sprintf("  ⚠ %v", m.err)))
		b.WriteString("\n\n")
	}

	// Help
	helpStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	b.WriteString(helpStyle.Render("  tab/↑/↓: navigate  •  enter: submit  •  esc: cancel"))
	b.WriteString("\n")
	
	return b.String()
}

func RunWizard() (*WizardResult, error) {
	m := InitialWizardModel()
	p := tea.NewProgram(m, tea.WithAltScreen())
	finalModel, err := p.Run()
	if err != nil {
		return nil, err
	}

	if fm, ok := finalModel.(wizardModel); ok {
		if fm.result.Canceled {
			return nil, fmt.Errorf("wizard canceled")
		}
		return fm.result, nil
	}

	return nil, fmt.Errorf("unknown error")
}