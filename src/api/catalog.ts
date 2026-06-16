/**
 * Bundled catalog of common Yandex Metrica dimensions and metrics.
 *
 * Metrica has NO API to enumerate dimensions/metrics — the catalog is
 * documentation-only (https://yandex.com/dev/metrika/en/stat/attrandmetr/dim_all).
 * This curated subset is surfaced by `get_metadata` so the model uses real
 * field names. It is intentionally a useful subset, not exhaustive.
 */

export interface CatalogEntry {
    id: string
    title: string
    /** `visits` (ym:s:) or `hits` (ym:pv:). A single query must not mix them. */
    namespace: 'visits' | 'hits'
}

/**
 * Attribution values for the `<attribution>` placeholder in source
 * dimensions/metrics (or the `attribution` request param). Default: `lastsign`.
 */
export const ATTRIBUTION_VALUES = [
    'first',
    'last',
    'lastsign',
    'last_yandex_direct_click',
    'cross_device_first',
    'cross_device_last',
    'cross_device_last_significant',
    'cross_device_last_yandex_direct_click',
    'automatic',
] as const

export const DEFAULT_ATTRIBUTION = 'lastsign'

export const DIMENSIONS: CatalogEntry[] = [
    // Traffic & source (the <attribution> below defaults to lastsign)
    {
        id: 'ym:s:lastsignTrafficSource',
        title: 'Traffic source group (organic, ad, direct, referral, …)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignSourceEngine',
        title: 'Specific source / engine',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignSearchEngine',
        title: 'Search engine',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignSearchEngineRoot',
        title: 'Search engine (root, grouped)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignSearchPhrase',
        title: 'Search query text (often suppressed/“not set”)',
        namespace: 'visits',
    },
    { id: 'ym:s:lastsignUTMSource', title: 'UTM source', namespace: 'visits' },
    { id: 'ym:s:lastsignUTMMedium', title: 'UTM medium', namespace: 'visits' },
    {
        id: 'ym:s:lastsignUTMCampaign',
        title: 'UTM campaign',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignUTMContent',
        title: 'UTM content',
        namespace: 'visits',
    },
    { id: 'ym:s:lastsignUTMTerm', title: 'UTM term', namespace: 'visits' },
    { id: 'ym:s:referer', title: 'Referrer URL', namespace: 'visits' },
    // Landing / exit / content
    {
        id: 'ym:s:startURL',
        title: 'Landing (entry) page, full URL',
        namespace: 'visits',
    },
    {
        id: 'ym:s:startURLPath',
        title: 'Landing page path',
        namespace: 'visits',
    },
    { id: 'ym:s:endURL', title: 'Exit page, full URL', namespace: 'visits' },
    { id: 'ym:s:endURLPath', title: 'Exit page path', namespace: 'visits' },
    { id: 'ym:pv:URL', title: 'Page URL (hits)', namespace: 'hits' },
    { id: 'ym:pv:title', title: 'Page title (hits)', namespace: 'hits' },
    // Geo
    { id: 'ym:s:regionCountry', title: 'Country', namespace: 'visits' },
    { id: 'ym:s:regionCity', title: 'City', namespace: 'visits' },
    {
        id: 'ym:s:regionArea',
        title: 'Region / oblast / state',
        namespace: 'visits',
    },
    // Device / tech
    {
        id: 'ym:s:deviceCategory',
        title: 'Device type (desktop/mobile/tablet/tv)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:mobilePhone',
        title: 'Phone brand/vendor',
        namespace: 'visits',
    },
    { id: 'ym:s:browser', title: 'Browser', namespace: 'visits' },
    {
        id: 'ym:s:operatingSystem',
        title: 'Operating system',
        namespace: 'visits',
    },
    {
        id: 'ym:s:operatingSystemRoot',
        title: 'Operating system family',
        namespace: 'visits',
    },
    {
        id: 'ym:s:screenResolution',
        title: 'Screen resolution',
        namespace: 'visits',
    },
    // Audience / behavior / time
    { id: 'ym:s:gender', title: 'Gender', namespace: 'visits' },
    { id: 'ym:s:ageInterval', title: 'Age bracket', namespace: 'visits' },
    {
        id: 'ym:s:isNewUser',
        title: 'New vs returning user',
        namespace: 'visits',
    },
    { id: 'ym:s:date', title: 'Visit date', namespace: 'visits' },
    { id: 'ym:s:startOfWeek', title: 'Week bucket', namespace: 'visits' },
    { id: 'ym:s:startOfMonth', title: 'Month bucket', namespace: 'visits' },
    { id: 'ym:s:startOfQuarter', title: 'Quarter bucket', namespace: 'visits' },
    { id: 'ym:s:startOfYear', title: 'Year bucket', namespace: 'visits' },
    { id: 'ym:s:dayOfWeek', title: 'Day of week', namespace: 'visits' },
    { id: 'ym:s:hour', title: 'Hour of day', namespace: 'visits' },
    // Geo (human-readable names; pass lang to control language)
    {
        id: 'ym:s:regionCountryName',
        title: 'Country (name)',
        namespace: 'visits',
    },
    { id: 'ym:s:regionCityName', title: 'City (name)', namespace: 'visits' },
    // Device / tech (extras)
    {
        id: 'ym:s:browserAndVersion',
        title: 'Browser and version',
        namespace: 'visits',
    },
    {
        id: 'ym:s:mobilePhoneModel',
        title: 'Mobile phone model',
        namespace: 'visits',
    },
    { id: 'ym:s:screenWidth', title: 'Screen width (px)', namespace: 'visits' },
    {
        id: 'ym:s:screenHeight',
        title: 'Screen height (px)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:browserLanguage',
        title: 'Browser language',
        namespace: 'visits',
    },
    // Source (social / recommendation / messenger; default lastsign attribution)
    {
        id: 'ym:s:lastsignSocialNetwork',
        title: 'Social network',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignRecommendationSystem',
        title: 'Recommendation system',
        namespace: 'visits',
    },
    {
        id: 'ym:s:lastsignMessenger',
        title: 'Messenger',
        namespace: 'visits',
    },
    // E-commerce
    { id: 'ym:s:productName', title: 'Product name', namespace: 'visits' },
    {
        id: 'ym:s:productCategoryLevel1',
        title: 'Product category (level 1)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:productBrand',
        title: 'Product brand',
        namespace: 'visits',
    },
    {
        id: 'ym:s:purchaseID',
        title: 'Purchase / order ID',
        namespace: 'visits',
    },
]

export const METRICS: CatalogEntry[] = [
    { id: 'ym:s:visits', title: 'Visits (sessions)', namespace: 'visits' },
    { id: 'ym:s:users', title: 'Unique users', namespace: 'visits' },
    { id: 'ym:s:newUsers', title: 'New users', namespace: 'visits' },
    {
        id: 'ym:s:percentNewVisitors',
        title: '% new users',
        namespace: 'visits',
    },
    {
        id: 'ym:s:pageviews',
        title: 'Pageviews (within visits)',
        namespace: 'visits',
    },
    { id: 'ym:s:bounceRate', title: 'Bounce rate (%)', namespace: 'visits' },
    {
        id: 'ym:s:pageDepth',
        title: 'Pages per visit (avg depth)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:avgVisitDurationSeconds',
        title: 'Avg visit duration (seconds)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:sumGoalReachesAny',
        title: 'Total goal reaches (any goal)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:anyGoalConversionRate',
        title: 'Conversion rate across any goal (%)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:robotPercentage',
        title: '% robot traffic',
        namespace: 'visits',
    },
    { id: 'ym:pv:pageviews', title: 'Pageviews (hits)', namespace: 'hits' },
    { id: 'ym:pv:users', title: 'Users (hits scope)', namespace: 'hits' },
    // E-commerce (revenue uses the counter's default currency)
    {
        id: 'ym:s:ecommercePurchases',
        title: 'Number of purchases',
        namespace: 'visits',
    },
    {
        id: 'ym:s:ecommerceConvertedRevenue',
        title: 'Revenue (counter currency)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:ecommerceConvertedRevenuePerPurchase',
        title: 'Average order value (revenue per purchase)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:ecommerceConvertedRevenuePerVisit',
        title: 'Average revenue per session',
        namespace: 'visits',
    },
    {
        id: 'ym:s:productPurchasedQuantity',
        title: 'Items purchased',
        namespace: 'visits',
    },
    {
        id: 'ym:s:productImpressions',
        title: 'Product views (impressions)',
        namespace: 'visits',
    },
    {
        id: 'ym:s:productBasketsQuantity',
        title: 'Items added to cart',
        namespace: 'visits',
    },
    {
        id: 'ym:s:usersPurchasePercentage',
        title: 'Share of users who purchased (%)',
        namespace: 'visits',
    },
]

/** Per-goal metric templates. Replace `<goalId>` with a real goal id. */
export const GOAL_METRIC_TEMPLATES: { id: string; title: string }[] = [
    { id: 'ym:s:goal<goalId>reaches', title: 'Goal reaches' },
    { id: 'ym:s:goal<goalId>visits', title: 'Converted sessions' },
    { id: 'ym:s:goal<goalId>users', title: 'Users who converted' },
    { id: 'ym:s:goal<goalId>conversionRate', title: 'Conversion rate (%)' },
]
