package telemetry

import (
	"bytes"
	"image/jpeg"
	"github.com/kbinani/screenshot"
)

// CaptureScreenBytes ekranın fotoğrafını çekip sıkıştırarak byte dizisi döner.
func CaptureScreenBytes() ([]byte, error) {
	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	// Sıkıştırma yapılarak gereksiz boyut engelleniyor
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 50})
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
