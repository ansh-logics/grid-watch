FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS builder
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_DEFAULT_USER_ID=22222222-2222-2222-2222-222222222222
ARG VITE_DEFAULT_ZONE_ID=11111111-1111-1111-1111-111111111111
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DEFAULT_USER_ID=$VITE_DEFAULT_USER_ID
ENV VITE_DEFAULT_ZONE_ID=$VITE_DEFAULT_ZONE_ID
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
