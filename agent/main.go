package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"agent/tui"

	"github.com/kardianos/service"
)

func main() {
	// Handle command-line configuration flags or standard service commands if passed
	if len(os.Args) > 1 {
		firstArg := os.Args[1]
		if firstArg[0] == '-' {
			apiKeyFlag := flag.String("api-key", "", "API Key for authentication")
			vpsIDFlag := flag.String("vps-id", "", "ID of this VPS")
			backendIPFlag := flag.String("backend-ip", "", "Backend IP and port (e.g. 1.2.3.4:50051)")
			flag.Parse()

			if *apiKeyFlag != "" || *vpsIDFlag != "" || *backendIPFlag != "" {
				cfg, err := LoadConfig()
				if err != nil {
					cfg = &Config{}
				}
				if *apiKeyFlag != "" {
					cfg.APIKey = *apiKeyFlag
				}
				if *vpsIDFlag != "" {
					cfg.VpsID = *vpsIDFlag
				}
				if *backendIPFlag != "" {
					cfg.BackendIP = *backendIPFlag
				}
				if cfg.VpsID == "" || cfg.BackendIP == "" || cfg.APIKey == "" {
					log.Fatalf("Error: Config requires all fields: --api-key, --vps-id, --backend-ip")
				}
				if err := SaveConfig(cfg); err != nil {
					log.Fatalf("Could not save config: %v", err)
				}
				fmt.Println("Configuration saved to config.json.")
			}
		} else {
			cfg, err := LoadConfig()
			if err != nil || cfg.VpsID == "" {
				log.Fatalf("Config file missing or invalid. Please configure the agent first.")
			}
			svc, err := setupService(cfg)
			if err != nil {
				log.Fatalf("Failed to setup service: %v", err)
			}
			err = service.Control(svc, firstArg)
			if err != nil {
				log.Fatalf("Valid actions: %q\n%v", service.ControlAction, err)
			}
			return
		}
	}

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
