import { Link, NavLink, Route, Routes } from 'react-router-dom'
import AuctionDetail from './pages/AuctionDetail'
import AuctionList from './pages/AuctionList'
import CreateRfq from './pages/CreateRfq'

export default function App() {
  return (
    <div className="container">
      <header>
        <div>
          <Link to="/" className="brand">RFQ Auction</Link>
          <p className="tagline">British auction — bids in the final minutes extend the close</p>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Auctions</NavLink>
          <NavLink to="/create">New RFQ</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<AuctionList />} />
        <Route path="/create" element={<CreateRfq />} />
        <Route path="/rfqs/:id" element={<AuctionDetail />} />
      </Routes>
    </div>
  )
}
