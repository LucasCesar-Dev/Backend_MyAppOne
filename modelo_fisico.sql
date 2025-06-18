
-- Criação do banco (opcional)
CREATE DATABASE IF NOT EXISTS ecommerce;
USE ecommerce;

-- Tabela: Categorias
CREATE TABLE Categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE,
    isSpecial BOOLEAN
);

-- Tabela: Marcas
CREATE TABLE Marcas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE
);

-- Tabela: Pickings
CREATE TABLE Pickings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rua VARCHAR(255),
    coluna VARCHAR(255),
    display VARCHAR(255),
    tipo VARCHAR(255),
    isLocate BOOLEAN,
    limit INT,
    endereco VARCHAR(255) UNIQUE
);

-- Tabela: Produtos
CREATE TABLE Produtos (
    id CHAR(36) PRIMARY KEY,
    sku VARCHAR(255) UNIQUE,
    tinyId VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    photo VARCHAR(255),
    cost FLOAT,
    gtin VARCHAR(255) UNIQUE,
    searchform VARCHAR(255),
    confirmform VARCHAR(255),
    ignoreform VARCHAR(255),
    ncm VARCHAR(255),
    brandrule VARCHAR(255),
    brandrulePremium VARCHAR(255),
    `group` VARCHAR(255),
    fullrule VARCHAR(255),
    weight FLOAT,
    heigth FLOAT,
    width FLOAT,
    length FLOAT,
    catalog_id VARCHAR(255),
    createdAt DATETIME DEFAULT NOW(),
    updatedAt DATETIME,
    pickingId INT,
    categoriaId INT,
    brandId INT,
    FOREIGN KEY (pickingId) REFERENCES Pickings(id),
    FOREIGN KEY (categoriaId) REFERENCES Categorias(id),
    FOREIGN KEY (brandId) REFERENCES Marcas(id)
);

-- Tabela: Combos
CREATE TABLE Combos (
    id CHAR(36) PRIMARY KEY,
    sku VARCHAR(255) UNIQUE,
    idTiny VARCHAR(255),
    name VARCHAR(255),
    photo VARCHAR(255),
    gtin VARCHAR(255),
    catalog_id VARCHAR(255),
    quantity INT,
    produtoId CHAR(36),
    createdAt DATETIME DEFAULT NOW(),
    updatedAt DATETIME,
    FOREIGN KEY (produtoId) REFERENCES Produtos(id)
);

-- Tabela: Kits
CREATE TABLE Kits (
    id CHAR(36) PRIMARY KEY,
    sku VARCHAR(255) UNIQUE,
    idTiny VARCHAR(255),
    name VARCHAR(255),
    photo VARCHAR(255),
    gtin VARCHAR(255),
    catalog_id VARCHAR(255),
    createdAt DATETIME DEFAULT NOW(),
    updatedAt DATETIME
);

-- Tabela: ProdutosOnKit (tabela de junção)
CREATE TABLE ProdutosOnKit (
    quantity INT,
    produtoId CHAR(36),
    kitId CHAR(36),
    PRIMARY KEY (produtoId, kitId),
    FOREIGN KEY (produtoId) REFERENCES Produtos(id),
    FOREIGN KEY (kitId) REFERENCES Kits(id)
);

-- Tabela: Desmembramento
CREATE TABLE Desmembramento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produtoId CHAR(36),
    fornecedor VARCHAR(255),
    cpfCnpj VARCHAR(255),
    tipo VARCHAR(255),
    quantidade INT,
    FOREIGN KEY (produtoId) REFERENCES Produtos(id)
);
