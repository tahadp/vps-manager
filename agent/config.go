package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	VpsID     string `json:"vps_id"`
	BackendIP string `json:"backend_ip"`
	APIKey    string `json:"api_key"`
}

func LoadConfig() (*Config, error) {
	return loadConfigFrom(getConfigPath())
}

func SaveConfig(cfg *Config) error {
	return saveConfigTo(getConfigPath(), cfg)
}

func loadConfigFrom(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveConfigTo(path string, cfg *Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func getConfigPath() string {
	ex, err := os.Executable()
	if err != nil {
		return "config.json"
	}
	return filepath.Join(filepath.Dir(ex), "config.json")
}
