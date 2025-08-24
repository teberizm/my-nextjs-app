import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="mb-4 text-4xl font-bold text-primary">HoloDeck</h1>
      <p className="mb-8 max-w-xl text-lg text-muted-foreground">
        HoloDeck, QR tabanlı kartları dijital oyunla birleştiren yeni nesil bir sosyal dedüksiyon oyunudur. Arkadaşlarınla bir araya gel ve hainleri ortaya çıkar!
      </p>
      <Link
        href="/demo"
        className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
      >
        Demo'yu Dene
      </Link>
    </main>
  )
}
