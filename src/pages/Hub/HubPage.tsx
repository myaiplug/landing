import Hero from '../../components/Hero'
import FeaturesSection from '../../components/FeaturesSection'
import ProductsGrid from '../../components/ProductsGrid'
import FreeToolsSection from '../../components/FreeToolsSection'
import ServicesSection from '../../components/ServicesSection'
import EmailCapture from '../../components/EmailCapture'
import productsData from '../../../products.json'

export default function HubPage() {
  return (
    <>
      <Hero />
      <FeaturesSection />
      <ProductsGrid products={productsData.products} categories={productsData.categories} />
      <FreeToolsSection />
      <ServicesSection />
      <EmailCapture />
    </>
  )
}
