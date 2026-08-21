import PropTypes from 'prop-types'
import { NavLink } from 'react-router-dom'
import { FiHome, FiShoppingBag, FiUsers, FiSettings, FiLogOut, FiPlus, FiGrid } from 'react-icons/fi'
import BrandLogo from './BrandLogo'

const links = [
  { to: '/', label: 'Dashboard', Icon: FiHome },
  { to: '/add', label: 'Add Product', Icon: FiPlus },
  { to: '/list', label: 'Products', Icon: FiGrid },
  { to: '/orders', label: 'Orders', Icon: FiShoppingBag },
]

const accountLinks = [
  { to: '/users', label: 'Users', Icon: FiUsers },
  { to: '/settings', label: 'Settings', Icon: FiSettings },
]

const LinkGroup = ({ items }) => items.map(({ to, label, Icon }) => (
  <NavLink
    key={to}
    className={({ isActive }) => `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
      isActive ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' : 'text-gray-600 hover:bg-gray-50'
    }`}
    to={to}
  >
    <Icon aria-hidden='true' className='w-5 h-5' />
    <p>{label}</p>
  </NavLink>
))

LinkGroup.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    to: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    Icon: PropTypes.elementType.isRequired,
  })).isRequired,
}

const SidebarContents = ({ onLogout }) => (
  <div className='flex flex-col h-full'>
    <div className='py-6 px-5 border-b border-gray-100'>
      <BrandLogo className="w-[140px] sm:w-[180px] md:w-[200px] text-black" title="Netronix admin" />
    </div>
    <div className='flex-1 py-8 px-3'>
      <p className='text-xs font-medium text-gray-600 px-3 mb-4 uppercase'>Main</p>
      <LinkGroup items={links} />
      <p className='text-xs font-medium text-gray-600 px-3 mt-8 mb-4 uppercase'>Account</p>
      <LinkGroup items={accountLinks} />
    </div>
    <div className='px-3 py-4 border-t border-gray-100'>
      <button
        type='button'
        onClick={onLogout}
        className='flex items-center gap-3 px-4 py-3 w-full text-left rounded-lg text-gray-600 hover:bg-gray-50 transition-all'
      >
        <FiLogOut aria-hidden='true' className='w-5 h-5' />
        <p>Logout</p>
      </button>
    </div>
  </div>
)

SidebarContents.propTypes = { onLogout: PropTypes.func.isRequired }

// The desktop navigation is a separate always-present landmark. The mobile
// drawer is mounted only while open, so a translated-off-screen drawer can
// never leave hidden links in the focus or accessibility tree.
const Sidebar = ({ onLogout, open = false, onDismiss }) => (
  <>
    <nav
      id='admin-sidebar-desktop'
      aria-label='Console sections'
      className='hidden lg:block w-[250px] min-h-screen bg-white shadow-sm fixed left-0 top-0 z-20'
    >
      <SidebarContents onLogout={onLogout} />
    </nav>

    {open && (
      <>
        <div
          className='lg:hidden fixed inset-0 bg-black/40 z-20'
          onClick={onDismiss}
          aria-hidden='true'
        />
        <nav
          id='admin-sidebar-mobile'
          aria-label='Mobile console sections'
          className='lg:hidden w-[250px] min-h-screen bg-white shadow-sm fixed left-0 top-0 z-20'
        >
          <SidebarContents onLogout={onLogout} />
        </nav>
      </>
    )}
  </>
)

Sidebar.propTypes = {
  onLogout: PropTypes.func.isRequired,
  open: PropTypes.bool,
  onDismiss: PropTypes.func,
}

export default Sidebar
