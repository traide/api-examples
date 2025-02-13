// Given a list of products that need classification, e.g. from an ERP system
const products = [
  {
    id: "123",
    articleNumber: "126-9002-001",
    name: "Distressed Rustic Concrete Vase",
    weight: "1.7 kg",
    dimensions: '7" Tall x 7.25" Wide',
  },
];

// Our client credentials, should not be hardcoded in production code
const CREDENTIALS = {
  client_id: "4907c6f3-5a65-42f6-9225-26cd9e8cfba5",
  client_secret: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
};

// We start by obtaining an authorization token that we can use for the whole application flow.
// This token expires after a while, so every process should obtain it's own token and discard it
// afterwards
const tokenResponse = await fetch("https://api.traide.ai/v1/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(CREDENTIALS),
});

if (!tokenResponse.ok) {
  throw new Error("Could not obtain authorization token.");
}
// If the response is successful, we can get the token from the access_token property in the
// response body
const { access_token } = await tokenResponse.json();

// Now it is time to create a new project. You can create projects depending on your needs but a
// typical use case we see is to run this process once a day and to create a project every day.
const now = new Date();
const dateString = `${now.getFullYear()}-${
  now.getMonth() + 1
}-${now.getDate()}`;
const projectName = `Daily Classification ${dateString}`;
const projectResponse = await fetch(
  "https://api.traide.ai/v1/project?project_name=" + projectName,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}` },
  }
);

if (!projectResponse.ok) {
  throw new Error(
    "Could not create project: " + (await projectResponse.text())
  );
}

// Now we start adding our products to the project. Products have to be added one by one
for (const product of products) {
  const productResponse = await fetch("https://api.traide.ai/v1/product", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      // We can let traide know about the unique identifier in our system. This is useful if we
      // want to map the result back to our ERP system
      external_id: product.id,
      // This identifier is displayed in the UI of the traide application. Ideally, it is not too
      // long.
      product_name: product.name,
      // The article number is also shown in the UI and can be used for searching the product
      article_number: product.articleNumber,
      // The description will be used for processing of our AI. We should add all the relevant
      // information to it:
      description:
        product.name +
        "\nWeight: " +
        product.weight +
        "\nDimensions: " +
        product.dimensions,
      // We need to supply the project name that we created earlier
      project_name: projectName,
      // There are a few other properties that can be set, but we will not use them in this example
    }),
  });

  if (!productResponse.ok) {
    throw new Error("Could not add product to project.");
  }
}

// Our data is now uploaded to traide and will be processed in the background. Next, a traide AI
// user can classify the products with the help of the AI assistant in the web application.

// Let's assume some time has passed and we want to check for the results of the classification.
// We start by querying all the products that are part of the project.
const productsResponse = await fetch(
  "https://api.traide.ai/v1/product?project_name=" + projectName,
  {
    method: "GET",
    headers: { Authorization: `Bearer ${access_token}` },
  }
);

if (!productsResponse.ok) {
  throw new Error("Could not query products.");
}

const productsData = await productsResponse.json();

// We can now iterate over the products and check if they have been classified
for (const product of productsData) {
  const productDetailResponse = await fetch(
    `https://api.traide.ai/v1/product/${product.product_id}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${access_token}` },
    }
  );

  if (!productDetailResponse.ok) {
    throw new Error(
      "Could not query classification." + (await productDetailResponse.text())
    );
  }

  const productDetailData = await productDetailResponse.json();
  console.log(productDetailData);

  // We find all the classifications (tariff numbers) that have been selected by the user in this
  // list. If there are no classifications yet, the user has not finished the classification
  // process yet.
  if (productDetailData.classifications.length > 0) {
    // Each classification belongs to a nomenclature. The property nomenclature_type indicates
    // which nomenclature type the classification belongs to.
    // The European 8-digit export code is called combined nomenclature.
    const combinedNomenclatureClassification =
      productDetailData.classifications.find(
        (classification) =>
          classification.nomenclature_type === "COMBINED_NOMENCLATURE"
      );

    if (
      combinedNomenclatureClassification &&
      combinedNomenclatureClassification.finalized_at
    ) {
      // The classification is finalized and we can write it back into our ERP system
      // For this demo, we just write the tariff number into the product object
      const erpProduct = products.find(
        (p) => p.id === productDetailData.external_id
      );
      if (!erpProduct) {
        throw new Error("Could not find product in ERP system.");
      }
      erpProduct.tariffNumber =
        combinedNomenclatureClassification.tariff_number;
    }
  }
}

console.log(products);
