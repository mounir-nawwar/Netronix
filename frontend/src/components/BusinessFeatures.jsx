import React from 'react';
import { HiOutlineUserGroup, HiOutlineShieldCheck } from 'react-icons/hi';
import { FiHeadphones, FiTruck } from 'react-icons/fi';

const features = [
    {
        icon: FiHeadphones,
        title: "Customer service",
        description: "It's not actually free we just price it into the products."
    },
    {
        icon: FiTruck,
        title: "Fast Free Shipping",
        description: "Get free shipping on orders of $150 or more"
    },
    {
        icon: HiOutlineUserGroup,
        title: "Refer a friend",
        description: "Refer a friend and get 15% off each other."
    },
    {
        icon: HiOutlineShieldCheck,
        title: "Secure payment",
        description: "Your payment information is processed securely"
    }
];

const FeatureCard = ({ Icon, title, description }) => (
    <div className="flex flex-col items-center text-center p-6 flex-1 border-r border-gray-200 last:border-r-0">
        <div className="w-12 h-12 mb-4 flex items-center justify-center">
            <Icon className="w-8 h-8 text-[#6a5acd]" />
        </div>
        <h3 className="text-lg font-michroma mb-2">{title}</h3>
        <p className="text-gray-600 text-sm max-w-xs">{description}</p>
    </div>
);

const BusinessFeatures = () => {
    return (
        <section className="w-full border-t border-gray-100 bg-gradient-to-r from-[#000000] to-[#434343]">
            <div className="h-full py-6 rounded-b-[2rem] bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr]">
                    {features.map((feature, index) => (
                        <FeatureCard
                            key={index}
                            Icon={feature.icon}
                            title={feature.title}
                            description={feature.description}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default BusinessFeatures;
