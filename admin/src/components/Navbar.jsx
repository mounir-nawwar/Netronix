import PropTypes from 'prop-types'
import { FiLogOut, FiMenu, FiUser, FiBell, FiSearch } from 'react-icons/fi'

// A11Y-009 / ADM-012 — the search input had no label of any kind (a
// placeholder is not an accessible name) and the bell was an icon-only button
// announced as "button". Both are named now.
//
// Neither *does* anything: the search box filters nothing and the badge is a
// hardcoded "2". That is ADM-008 / A-9, and removing decorative controls is
// Phase 5's call, not this phase's. Labelling something inert at least means a
// screen-reader user finds out what it claims to be.
const Navbar = ({ onLogout, admin, navOpen = false, onToggleNav }) => {
  return (
    <header className='fixed top-0 left-0 lg:left-[250px] right-0 z-30 flex items-center h-16 px-3 sm:px-6 justify-between bg-white shadow-sm border-b border-gray-100'>
      {onToggleNav && (
        <button
          type='button'
          onClick={onToggleNav}
          aria-label={navOpen ? 'Close the navigation menu' : 'Open the navigation menu'}
          aria-expanded={navOpen}
          aria-controls={navOpen ? 'admin-sidebar-mobile' : undefined}
          className='lg:hidden p-2 mr-2 rounded-md text-gray-600 hover:bg-gray-100'
        >
          <FiMenu className='w-5 h-5' aria-hidden='true' />
        </button>
      )}

      {/* Search bar */}
      <div className="flex items-center flex-1 lg:w-1/3 lg:flex-none">
        <div className="relative w-full">
          <label htmlFor="admin-search" className="sr-only">Search the console</label>
          <input
            id="admin-search"
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent"
          />
          <FiSearch aria-hidden="true" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600" />
        </div>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button type="button" aria-label="Notifications, 2 unread" className="p-2 rounded-full text-gray-600 hover:bg-gray-100 relative">
          <FiBell aria-hidden="true" className="w-5 h-5" />
          <span aria-hidden="true" className="absolute top-0 right-0 h-4 w-4 bg-[#6a5acd] rounded-full text-white text-[10px] flex items-center justify-center">2</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 bg-[#f5f3ff] py-1.5 px-3 rounded-md">
          <FiUser aria-hidden="true" className="text-[#6a5acd]" />
          <span className="text-sm text-gray-700">{admin?.name || 'Admin'}</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className='flex items-center gap-1.5 bg-white border border-[#6a5acd] text-[#6a5acd] hover:bg-[#6a5acd] hover:text-white transition-colors px-4 py-1.5 rounded-md text-sm'
        >
          <FiLogOut aria-hidden="true" className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  )
}

Navbar.propTypes = {
  onLogout: PropTypes.func.isRequired,
  admin: PropTypes.shape({ name: PropTypes.string }),
  navOpen: PropTypes.bool,
  onToggleNav: PropTypes.func,
}

export default Navbar