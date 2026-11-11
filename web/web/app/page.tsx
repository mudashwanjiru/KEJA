export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="text-xl font-bold text-blue-600">StallSpace KE</div>
        <div className="space-x-4">
          <button className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600">
            For Landlords
          </button>
          <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Find a Stall
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 text-center bg-blue-900 text-white">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
          Find & Rent Commercial Stalls with Ease
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-blue-200 mb-8">
          The ultimate platform connecting entrepreneurs to retail stalls, market spaces, and container kiosks with automated digital leasing.
        </p>

        {/* Search Bar Widget */}
        <div className="max-w-3xl mx-auto p-4 bg-white rounded-xl shadow-lg flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Search location (e.g., Nairobi CBD, Westlands)" 
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select className="px-4 py-3 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option>All Categories</option>
            <option>Fashion & Apparel</option>
            <option>Electronics</option>
            <option>Food Kiosk</option>
          </select>
          <button className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">
            Search Stalls
          </button>
        </div>
      </section>

      {/* Featured Stalls Preview */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Featured Commercial Spaces</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stall Card 1 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="h-48 bg-slate-200 flex items-center justify-center text-slate-500 font-medium">Stall Photo</div>
            <div className="p-5">
              <span className="text-xs font-semibold px-2.5 py-1 bg-green-100 text-green-700 rounded-full">Available</span>
              <h3 className="text-lg font-bold mt-2">Stall A-12, City Plaza</h3>
              <p className="text-sm text-slate-500">High foot-traffic ground floor space</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-blue-600 font-bold">$150 / month</span>
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg">View Details</button>
              </div>
            </div>
          </div>
          {/* Stall Card 2 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="h-48 bg-slate-200 flex items-center justify-center text-slate-500 font-medium">Stall Photo</div>
            <div className="p-5">
              <span className="text-xs font-semibold px-2.5 py-1 bg-green-100 text-green-700 rounded-full">Available</span>
              <h3 className="text-lg font-bold mt-2">Kiosk #4, Market Hub</h3>
              <p className="text-sm text-slate-500">Ideal for electronics or accessories</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-blue-600 font-bold">$100 / month</span>
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg">View Details</button>
              </div>
            </div>
          </div>
          {/* Stall Card 3 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="h-48 bg-slate-200 flex items-center justify-center text-slate-500 font-medium">Stall Photo</div>
            <div className="p-5">
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full">Almost Booked</span>
              <h3 className="text-lg font-bold mt-2">Booth B-03, Arcade Mall</h3>
              <p className="text-sm text-slate-500">Secure indoor storefront</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-blue-600 font-bold">$220 / month</span>
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg">View Details</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}