export type DeliveryPersona = 'food';

export const ACTIVE_PERSONA: DeliveryPersona = 'food';

export interface PersonaPlatform {
  id: 'zomato' | 'swiggy';
  name: string;
  color: string;
  emoji: string;
}

export const PERSONA_PLATFORMS: Record<DeliveryPersona, PersonaPlatform[]> = {
  food: [
    { id: 'zomato', name: 'Zomato', color: '#E23744', emoji: '🍕' },
    { id: 'swiggy', name: 'Swiggy', color: '#FC8019', emoji: '🍔' },
  ],
};

export const PERSONA_LABELS: Record<DeliveryPersona, string> = {
  food: 'Food Delivery Partners',
};
