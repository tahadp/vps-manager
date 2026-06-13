package telemetry

import (
	"bytes"
	"fmt"
	"image/jpeg"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/kbinani/screenshot"
)

// CaptureScreenBytes ekranın fotoğrafını çekip sıkıştırarak byte dizisi döner.
func CaptureScreenBytes() ([]byte, error) {
	if runtime.GOOS == "linux" {
		return captureLinux()
	}
	return captureDesktop()
}

// captureDesktop kbinani/screenshot ile masaüstü ortamlarda çalışır
func captureDesktop() ([]byte, error) {
	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return nil, fmt.Errorf("screenshot capture failed: %w", err)
	}
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 50})
	if err != nil {
		return nil, fmt.Errorf("jpeg encode failed: %w", err)
	}
	return buf.Bytes(), nil
}

// captureLinux headless Linux ortamlarda scrot veya gnome-screenshot kullanır
func captureLinux() ([]byte, error) {
	// Önce X11 DISPLAY kontrolü
	if os.Getenv("DISPLAY") == "" {
		return nil, fmt.Errorf("no DISPLAY set, screenshot not available in headless environment")
	}

	// scrot dene
	if data, err := captureWithScrot(); err == nil {
		return data, nil
	}

	// gnome-screenshot dene
	if data, err := captureWithGnomeScreenshot(); err == nil {
		return data, nil
	}

	// import (ImageMagick) dene
	if data, err := captureWithImport(); err == nil {
		return data, nil
	}

	return nil, fmt.Errorf("no screenshot tool available (install scrot, gnome-screenshot, or imagemagick)")
}

func captureWithScrot() ([]byte, error) {
	tmpFile := filepath.Join(os.TempDir(), "vps_screenshot.jpg")
	cmd := exec.Command("scrot", "-o", tmpFile)
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile)
	return os.ReadFile(tmpFile)
}

func captureWithGnomeScreenshot() ([]byte, error) {
	tmpFile := filepath.Join(os.TempDir(), "vps_screenshot.jpg")
	cmd := exec.Command("gnome-screenshot", "-f", tmpFile)
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile)
	return os.ReadFile(tmpFile)
}

func captureWithImport() ([]byte, error) {
	tmpFile := filepath.Join(os.TempDir(), "vps_screenshot.jpg")
	cmd := exec.Command("import", "-window", "root", tmpFile)
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile)
	return os.ReadFile(tmpFile)
}

// IsHeadless ortamın headless olup olmadığını kontrol eder
func IsHeadless() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	return os.Getenv("DISPLAY") == "" && !strings.Contains(os.Getenv("WAYLAND_DISPLAY"), "wayland")
}
