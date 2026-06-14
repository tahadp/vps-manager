package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"agent/tui"

	"github.com/kardianos/service"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil || cfg.VpsID == "" {
		// If no config, run wizard
		res, werr := tui.RunWizard()
		if werr != nil {
			if errors.Is(werr, tui.ErrWizardCanceled) {
				log.Println("Wizard canceled by user. Exiting cleanly.")
				return
			}
			log.Fatalf("Wizard failed: %v", werr)
		}

		cfg = &Config{
			VpsID:     res.VpsID,
			BackendIP: res.BackendIP,
			APIKey:    res.APIKey,
		}
		if err := SaveConfig(cfg); err != nil {
			log.Fatalf("Could not save config: %v", err)
		}
	}

	svc, err := setupService(cfg)
	if err != nil {
		log.Fatalf("Failed to setup service: %v", err)
	}

	// Handle standard service arguments if passed (e.g. agent install)
	if len(os.Args) > 1 {
		err = service.Control(svc, os.Args[1])
		if err != nil {
			log.Fatalf("Valid actions: %q\n%v", service.ControlAction, err)
		}
		return
	}

	// Determine if running as an interactive terminal
	if service.Interactive() {
		runInteractiveDashboard(svc, cfg)
	} else {
		// Running under the service manager
		err = svc.Run()
		if err != nil {
			log.Fatalf("Service run error: %v", err)
		}
	}
}

func runInteractiveDashboard(svc service.Service, cfg *Config) {
	status := "Stopped"
	if s, err := svc.Status(); err == nil {
		switch s {
		case service.StatusRunning:
			status = "Running as Service"
		case service.StatusStopped:
			status = "Service Installed, Stopped"
		default:
			status = "Unknown Service Status"
		}
	} else {
		status = "Service not installed or status unavailable"
	}

	actionCb := func(action tui.DashboardAction) (string, error) {
		switch action {
		case tui.ActionInstallService:
			err := service.Control(svc, "install")
			return "Service Installed", err
		case tui.ActionUninstallService:
			err := service.Control(svc, "uninstall")
			return "Service Uninstalled", err
		case tui.ActionStartService:
			err := service.Control(svc, "start")
			return "Service Started", err
		case tui.ActionStopService:
			err := service.Control(svc, "stop")
			return "Service Stopped", err
		}
		return "", nil
	}

	for {
		action, err := tui.RunDashboard(status, actionCb)
		if err != nil || action == tui.ActionQuit {
			break
		}

		if action == tui.ActionStartForeground {
			fmt.Println("Starting agent in foreground. Press Ctrl+C to stop.")
			err := svc.Run()
			if err != nil {
				log.Printf("Agent exited with error: %v", err)
			}
			break
		}
		
		// Update status for the next render loop
		if s, err := svc.Status(); err == nil {
			switch s {
			case service.StatusRunning:
				status = "Running as Service"
			case service.StatusStopped:
				status = "Service Installed, Stopped"
			}
		} else {
			status = "Service not installed or status unavailable"
		}
	}
}
