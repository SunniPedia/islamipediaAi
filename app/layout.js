export const metadata = {
  title: "islamiPedia AI - ইসলামী বিশ্বকোষ ও আল হাদিস | Islamic Knowledge AI",
  description: "islamiPedia AI - Your trusted AI companion for authentic Islamic knowledge.",
}
export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body style={{margin:0}}>{children}</body>
    </html>
  )
}
