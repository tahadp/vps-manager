package telemetry

import (
	// "bytes"
	// "encoding/base64"
	// "image/jpeg"
	// "github.com/kbinani/screenshot"
)

// CaptureScreenBase64 ekranın fotoğrafını çekip sıkıştırarak Base64 string'e çevirir.
func CaptureScreenBase64() (string, error) {
	/*
	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	// Sıkıştırma yapılarak gereksiz boyut engelleniyor
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 50})
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
	*/
	return "BASE64_PLACEHOLDER", nil
}
