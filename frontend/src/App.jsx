import { Link, Route, Routes } from 'react-router-dom'
import AuctionDetail from './pages/AuctionDetail'
import AuctionList from './pages/AuctionList'
import CreateRfq from './pages/CreateRfq'

export default function App() {
  return (
    <div className="container">
      <header>
        <Link to="/" className="brand">RFQ Auction</Link>
        <Link to="/create" className="button">New RFQ</Link>
      </header>
      <Routes>
        <Route path="/" element={<AuctionList />} />
        <Route path="/create" element={<CreateRfq />} />
        <Route path="/rfqs/:id" element={<AuctionDetail />} />
      </Routes>
    </div>
  )
}
