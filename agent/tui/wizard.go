package tui

import (
	"fmt"
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
	inputs  []textinput.Model
	focus   int
	err     error
	result  *WizardResult
	done    bool
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
			t.Placeholder = "Backend IP (e.g. 127.0.0.1:50051)"
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

func (m wizardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			m.result.Canceled = true
			m.done = true
			return m, tea.Quit
		case tea.KeyEnter, tea.KeyUp, tea.KeyDown, tea.KeyTab:
			s := msg.String()

			if s == "enter" && m.focus == len(m.inputs)-1 {
				m.result.VpsID = m.inputs[0].Value()
				m.result.BackendIP = m.inputs[1].Value()
				m.result.APIKey = m.inputs[2].Value()
				m.done = true
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
	b.WriteString("\nVPS Agent Configuration Wizard\n\n")

	for i := range m.inputs {
		b.WriteString(m.inputs[i].View())
		if i < len(m.inputs)-1 {
			b.WriteRune('\n')
		}
	}

	b.WriteString("\n\n(tab/up/down to navigate, enter on last to submit, esc to quit)\n")
	return b.String()
}

func RunWizard() (*WizardResult, error) {
	m := InitialWizardModel()
	p := tea.NewProgram(m)
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
