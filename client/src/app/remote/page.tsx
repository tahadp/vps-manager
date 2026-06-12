export default function RustDeskWeb() {
  return (
    <div className="w-full h-screen bg-black">
      {/* RustDesk Web istemcisi Iframe olarak gömülüyor */}
      <iframe src="http://localhost:8080" className="w-full h-full border-none" title="RustDesk Web UI" />
    </div>
  );
}
