import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '../App'
import HubPage from '../pages/Hub/HubPage'
import LiminalPage from '../pages/Liminal/LiminalPage'
import ScrewAIPage from '../pages/ScrewAI/ScrewAIPage'
import NoDAWPage from '../pages/NoDAW/NoDAWPage'
import ConvertIT from '../pages/Tools/ConvertIT'
import TrimIT from '../pages/Tools/TrimIT'
import FxIT from '../pages/Tools/FxIT'
import TestIT from '../pages/Tools/TestIT'
import ImageToICO from '../pages/Tools/ImageToICO'
import SeoTemplate from '../pages/SEO/SeoTemplate'
import { SEO_PAGES } from '../pages/SEO/seoConfig'

const seoRoutes = SEO_PAGES.map((page) => ({
  path: page.slug,
  element: <SeoTemplate config={page} />,
}))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HubPage /> },
      { path: 'liminal', element: <LiminalPage /> },
      { path: 'screwai', element: <ScrewAIPage /> },
      { path: 'nodaw', element: <NoDAWPage /> },
      { path: 'convertit', element: <ConvertIT /> },
      { path: 'timit', element: <TrimIT /> },
      { path: 'fxit', element: <FxIT /> },
      { path: 'testit', element: <TestIT /> },
      { path: 'ico', element: <ImageToICO /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  ...seoRoutes,
])
