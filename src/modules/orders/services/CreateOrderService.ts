import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customerId: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customerId, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customerId);

    if (!customer) {
      throw new AppError('Customer id not valid');
    }

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length) {
      throw new AppError('Could not find products');
    }

    const existingProductsIds = existingProducts.map(product => product.id);

    const notFoundProducts = products.filter(
      product => !existingProductsIds.includes(product.id),
    );

    if (notFoundProducts.length) {
      throw new AppError(
        `Could not find products with ids ${notFoundProducts
          .map(product => product.id)
          .join(',')}`,
      );
    }

    const productsUnderStock = products.filter(product =>
      existingProducts.find(
        ep => ep.id === product.id && ep.quantity < product.quantity,
      ),
    );

    if (productsUnderStock.length) {
      throw new AppError(
        `Products quantity in stock under requested ammount: ${productsUnderStock
          .map(product => product.id)
          .join(',')}`,
      );
    }

    const formattedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existingProducts.filter(ep => ep.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: formattedProducts,
    });

    const orderedProductsQuantity = products.map(product => ({
      id: product.id,
      quantity:
        existingProducts.filter(ep => ep.id === product.id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
