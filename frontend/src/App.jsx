import { Link, Route, Routes } from 'react-router-dom'
import AuctionList from './pages/AuctionList'

export default function App() {
  return (
    <div className="container">
      <header>
        <Link to="/" className="brand">RFQ Auction</Link>
        <Link to="/create" className="button">New RFQ</Link>
      </header>
      <Routes>
        <Route path="/" element={<AuctionList />} />
      </Routes>
    </div>
  )
}
