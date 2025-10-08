'use client';

import { motion } from 'framer-motion';
import { Car, Shield, Calculator, Users } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const HeroSection = () => {
  return (
    <section className="relative min-h-screen bg-gradient-to-br from-primary via-primary/90 to-blue-600 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-white/5 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.1)_0%,_transparent_50%)]"></div>
      </div>
      
      <div className="relative z-10 container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Your College
              <span className="block bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                Ride Partner
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl mb-8 opacity-90 max-w-2xl mx-auto">
              Connect with fellow students, share rides safely, and split costs. 
              Verified college-only community with gender preferences.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
                <Link href="/sign-up">Sign Up Now</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 bg-white/10 border-white/30 text-white hover:bg-white/20" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </div>
          </motion.div>

          {/* Feature Cards */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-16"
          >
            {[
              { icon: Shield, title: "Verified Students", desc: "College email verification required" },
              { icon: Users, title: "Gender Preference", desc: "Choose your comfort zone" },
              { icon: Calculator, title: "Fair Cost Split", desc: "Automatic expense calculation" },
              { icon: Car, title: "Real-time Tracking", desc: "Live location sharing" }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20"
              >
                <feature.icon className="w-8 h-8 mb-4 mx-auto text-white" />
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-white/80 text-sm">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Floating elements */}
      <div className="absolute top-1/4 left-10 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
      <div className="absolute bottom-1/4 right-10 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
    </section>
  );
};

export default HeroSection;