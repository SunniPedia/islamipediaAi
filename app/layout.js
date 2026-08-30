import "./globals.css"
export const metadata = {
  title: "islamiPedia AI - ইসলামী বিশ্বকোষ",
  description: "Your trusted AI companion for authentic Islamic knowledge.",
}
export default function RootLayout({ children }) {
  return <html lang="bn"><body>{children}</body></html>
}