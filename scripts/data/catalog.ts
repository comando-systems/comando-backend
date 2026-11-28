/**
 * Curated demo catalog. Image URLs were resolved once from Open Food Facts (product photos,
 * CC BY-SA 3.0) and Pexels (Pexels License); they are stored so seeding needs no API key
 * and never depends on an external service at runtime. Credits stay here, not in the database.
 */
export interface CatalogSeedItem {
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly categories: readonly string[];
  readonly imageUrl: string;
  readonly imageCredit: string;
  readonly imageSource: string;
}

export const catalogSeedItems: readonly CatalogSeedItem[] = [
  {
    name: 'Espresso',
    description: 'Espresso curto e encorpado, servido em xícara de 30 ml.',
    priceCents: 750,
    categories: ['Cafés', 'Bebidas quentes', 'Vegano'],
    imageUrl:
      'https://images.pexels.com/photos/36192953/pexels-photo-36192953.jpeg?auto=compress&cs=tinysrgb&w=600',
    imageCredit: 'Photo by Gizem Gökce on Pexels',
    imageSource:
      'https://www.pexels.com/photo/close-up-of-espresso-coffee-with-rich-crema-36192953/',
  },
  {
    name: 'Cappuccino',
    description: 'Espresso com leite vaporizado e espuma cremosa.',
    priceCents: 1200,
    categories: ['Cafés', 'Bebidas quentes', 'Com leite'],
    imageUrl:
      'https://images.pexels.com/photos/4422870/pexels-photo-4422870.jpeg?auto=compress&cs=tinysrgb&w=600',
    imageCredit: 'Photo by Maksim Goncharenok on Pexels',
    imageSource: 'https://www.pexels.com/photo/cup-of-cappuccino-on-wooden-surface-4422870/',
  },
  {
    name: 'Pão de Queijo',
    description: 'Pão de queijo mineiro assado na hora, porção com 4 unidades.',
    priceCents: 650,
    categories: ['Salgados', 'Lanches', 'Sem glúten'],
    imageUrl:
      'https://images.pexels.com/photos/20450299/pexels-photo-20450299.jpeg?auto=compress&cs=tinysrgb&w=600',
    imageCredit: 'Photo by thiago japyassu on Pexels',
    imageSource: 'https://www.pexels.com/photo/brazilian-cheese-bread-in-the-oven-20450299/',
  },
  {
    name: 'Croissant de Chocolate',
    description: 'Croissant recheado com chocolate, 60 g.',
    priceCents: 900,
    categories: ['Pães', 'Doces', 'Snacks'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/762/220/138/9482/front_en.4.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/7622201389482',
  },
  {
    name: 'Café em Grãos Espresso',
    description: 'Grãos de café para espresso, pacote com 500 g.',
    priceCents: 4200,
    categories: ['Cafés', 'Grãos', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/326/134/100/1744/front_fr.18.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/3261341001744',
  },
  {
    name: 'Café com Chicória Solúvel',
    description: 'Bebida solúvel de café com chicória, lata de 260 g.',
    priceCents: 1800,
    categories: ['Cafés', 'Bebidas quentes', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/761/303/567/6497/front_en.258.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/7613035676497',
  },
  {
    name: 'Cappuccino Solúvel',
    description: 'Café solúvel sabor cappuccino com avelã, caixa de 270 g.',
    priceCents: 1900,
    categories: ['Cafés', 'Bebidas quentes', 'Com leite'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/761/303/454/2854/front_en.92.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/7613034542854',
  },
  {
    name: 'Suco de Laranja',
    description: 'Suco de laranja espremido, garrafa de 1 L.',
    priceCents: 1350,
    categories: ['Sucos', 'Bebidas', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/350/211/000/9449/front_en.151.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/3502110009449',
  },
  {
    name: 'Refrigerante de Cola',
    description: 'Refrigerante de cola original, lata de 500 ml.',
    priceCents: 750,
    categories: ['Refrigerantes', 'Bebidas', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/544/900/005/4227/front_en.530.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/5449000054227',
  },
  {
    name: 'Refrigerante de Cola Zero',
    description: 'Refrigerante de cola sem açúcares, lata de 350 ml.',
    priceCents: 750,
    categories: ['Refrigerantes', 'Bebidas', 'Sem açúcar'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/544/900/021/4799/front_en.363.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/5449000214799',
  },
  {
    name: 'Água Mineral com Gás',
    description: 'Água mineral natural com gás, garrafa de 500 ml.',
    priceCents: 950,
    categories: ['Água', 'Bebidas', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/800/227/001/4901/front_en.304.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/8002270014901',
  },
  {
    name: 'Água Mineral Sem Gás',
    description: 'Água mineral natural sem gás, garrafa de 1,5 L.',
    priceCents: 600,
    categories: ['Água', 'Bebidas', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/611/103/500/0058/front_en.134.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/6111035000058',
  },
  {
    name: 'Chá Gelado de Pêssego',
    description: 'Chá gelado de pêssego, garrafa de 1,5 L.',
    priceCents: 800,
    categories: ['Chás', 'Bebidas', 'Refrigerantes'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/316/893/015/9896/front_fr.136.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/3168930159896',
  },
  {
    name: 'Limonada com Gás',
    description: 'Bebida de limão com gás, lata de 330 ml.',
    priceCents: 800,
    categories: ['Refrigerantes', 'Bebidas', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/544/900/027/2256/front_el.21.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/5449000272256',
  },
  {
    name: 'Chocolate Amargo 70%',
    description: 'Barra de chocolate amargo 70% cacau, 100 g.',
    priceCents: 2200,
    categories: ['Doces', 'Snacks', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/304/692/002/9759/front_en.544.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/3046920029759',
  },
  {
    name: 'Pasta de Avelã com Cacau',
    description: 'Pasta de avelã com cacau, pote de 200 g.',
    priceCents: 2500,
    categories: ['Doces', 'Snacks', 'Pastas'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/000/008/017/7173/front_en.484.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/80177173',
  },
  {
    name: 'Batata Frita Congelada',
    description: 'Batata frita fina para forno, pacote de 1 kg.',
    priceCents: 1800,
    categories: ['Salgados', 'Congelados', 'Vegano'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/871/043/812/3784/front_en.23.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/8710438123784',
  },
  {
    name: 'Sorvete de Baunilha',
    description: 'Sorvete de baunilha com pedaços de cookie, pote de 465 ml.',
    priceCents: 2900,
    categories: ['Sobremesas', 'Sorvetes', 'Com leite'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/871/132/737/3105/front_en.236.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/8711327373105',
  },
  {
    name: 'Biscoito de Cacau sem Açúcar',
    description: 'Biscoito de cacau e aveia sem açúcares adicionados, pacote de 200 g.',
    priceCents: 1100,
    categories: ['Doces', 'Biscoitos', 'Sem açúcar'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/317/568/110/5423/front_fr.135.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/3175681105423',
  },
  {
    name: 'Mix de Açaí sem Glúten',
    description: 'Mistura de açaí, banana e morango para bowl, pacote de 125 g.',
    priceCents: 2100,
    categories: ['Sobremesas', 'Saudável', 'Vegano', 'Sem glúten'],
    imageUrl:
      'https://images.openfoodfacts.net/images/products/560/031/747/2894/front_fr.61.400.jpg',
    imageCredit: 'Open Food Facts product photo (CC BY-SA 3.0)',
    imageSource: 'https://world.openfoodfacts.org/product/5600317472894',
  },
];
